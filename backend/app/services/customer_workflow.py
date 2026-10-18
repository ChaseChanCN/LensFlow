"""Shared customer workflow rules for legacy Web and mobile adapters.

Writes serialize on the authoritative owner/order row, then commit atomically.
No process-local idempotency or replacement selection/order domain.
"""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.core.exceptions import (
    AppException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from app.models.booking import Booking
from app.models.customer_bridge import BookingRequestKey, CustomerSelectionDraft
from app.models.order import Order, OrderTimeline
from app.models.photo import Photo
from app.models.retouch import RetouchTask
from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
from app.models.user import User
from app.services.order_state import OrderStateMachine, OrderStatus


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def lock_user(db: Session, user: User):
    # Works on SQLite too; raw SQL deliberately does not touch users.updated_at.
    db.execute(text("UPDATE users SET id=id WHERE id=:uid"), {"uid": user.id})


def order_access(db: Session, order_id: int, user: User, *, lock=False):
    query = db.query(Order).filter(Order.id == order_id)
    order = (query.with_for_update() if lock else query).populate_existing().first()
    if not order:
        raise NotFoundException("Order")
    if not (
        (user.role == "client" and order.client_id == user.id)
        or (user.role == "photographer" and order.photographer_id == user.id)
        or user.role == "admin"
    ):
        raise ForbiddenException()
    return order


def booking_access(db, booking_id, user, *, lock=False):
    query = db.query(Booking).filter(Booking.id == booking_id)
    booking = (query.with_for_update() if lock else query).populate_existing().first()
    if not booking:
        raise NotFoundException("Booking")
    if not (
        user.role == "admin"
        or (user.role == "client" and booking.client_id == user.id)
        or (
            user.role == "photographer"
            and (
                booking.photographer_id == user.id
                or (booking.photographer_id is None and booking.status == "pending")
            )
        )
    ):
        raise ForbiddenException()
    return booking


def create_booking(db, user, request, key=None):
    if key is not None and not re.fullmatch(r"[A-Za-z0-9_.:-]{8,128}", key):
        raise ValidationException("Idempotency-Key must contain 8–128 ASCII safe characters")
    if request.photographer_id is not None:
        target = db.get(User, request.photographer_id)
        if not target or target.role != "photographer" or not target.is_active:
            raise ValidationException("Photographer is unavailable")
    payload = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    lock_user(db, user)
    now = utcnow()
    # Retention is bounded by 100 live retry keys/customer and bounded expiry cleanup.
    expired = (
        db.query(BookingRequestKey.id)
        .filter(BookingRequestKey.user_id == user.id, BookingRequestKey.expires_at <= now)
        .order_by(BookingRequestKey.id)
        .limit(100)
        .all()
    )
    if expired:
        db.query(BookingRequestKey).filter(
            BookingRequestKey.id.in_([r.id for r in expired])
        ).delete(synchronize_session=False)
    key_hash = hashlib.sha256(key.encode()).hexdigest() if key is not None else None
    if key_hash:
        old = db.query(BookingRequestKey).filter_by(user_id=user.id, key_hash=key_hash).first()
        if old:
            if old.payload_hash != payload:
                raise ConflictException("Idempotency key belongs to a different request")
            return db.get(Booking, old.booking_id)
        if db.query(BookingRequestKey).filter_by(user_id=user.id).count() >= 100:
            raise AppException("BOOKING_RETRY_LIMIT", "Too many active retry keys", status_code=429)
    booking = Booking(client_id=user.id, status="pending", **request.model_dump())
    db.add(booking)
    db.flush()
    if key_hash:
        db.add(
            BookingRequestKey(
                user_id=user.id,
                key_hash=key_hash,
                payload_hash=payload,
                booking_id=booking.id,
                expires_at=now + timedelta(hours=24),
            )
        )
    db.commit()
    db.refresh(booking)
    return booking


def selection_for_order(db, order, user, *, editable=False):
    selection = (
        db.query(SelectionSet).filter_by(order_id=order.id).order_by(SelectionSet.id).first()
    )
    if not selection:
        raise NotFoundException("SelectionSet")
    if user.role == "client" and not selection.published_at:
        raise NotFoundException("Published selection")
    if editable and (
        order.status != "WAITING_SELECTION"
        or not selection.published_at
        or (selection.expires_at and as_utc(selection.expires_at) <= as_utc(utcnow()))
    ):
        raise ConflictException("Selection is not editable")
    return selection


def selection_state(db, order, selection):
    draft = db.get(CustomerSelectionDraft, selection.id, populate_existing=True)
    submission = (
        db.query(SelectionSubmission)
        .filter_by(selection_set_id=selection.id)
        .order_by(SelectionSubmission.id)
        .first()
    )
    ids = list(draft.selected_photo_ids) if draft else []
    if submission:
        # Older fixtures/integrations may have serialized a JSON array instead of CSV.
        try:
            ids = (
                json.loads(submission.selected_photo_ids)
                if submission.selected_photo_ids.startswith("[")
                else [int(v) for v in submission.selected_photo_ids.split(",") if v]
            )
        except (ValueError, TypeError):
            raise AppException(
                "SELECTION_DATA_INVALID", "Selection requires staff review", status_code=503
            ) from None
    editable = bool(
        not submission
        and selection.published_at
        and order.status == "WAITING_SELECTION"
        and (not selection.expires_at or as_utc(selection.expires_at) > as_utc(utcnow()))
    )
    return {
        "id": selection.id,
        "order_id": order.id,
        "revision": draft.revision if draft else 0,
        "selected_photo_ids": ids,
        "max_select": selection.max_select,
        "status": "submitted" if submission else "draft",
        "editable": editable,
        "can_submit": editable and bool(ids),
        "expires_at": as_utc(selection.expires_at),
        "published_at": as_utc(selection.published_at),
    }


def revision_conflict(state):
    # Keep the repository code/message/detail envelope, with a typed current snapshot.
    from app.schemas.customer import SelectionState

    raise AppException(
        "SELECTION_CONFLICT",
        "Selection changed; reload authoritative state",
        detail={"current": SelectionState.model_validate(state).model_dump(mode="json")},
        status_code=409,
    )


def validate_selection_ids(db, order, selection, ids, *, final=False):
    if len(ids) > 100 or len(set(ids)) != len(ids):
        raise ValidationException("Duplicate or excessive photo IDs")
    if len(ids) > selection.max_select or (final and not ids):
        raise ValidationException("Selection quota violated")
    if len(",".join(map(str, ids))) > 500:
        raise ValidationException("Selection exceeds legacy submission capacity")
    offered = (
        db.query(SelectionItem.photo_id)
        .join(Photo, Photo.id == SelectionItem.photo_id)
        .filter(
            SelectionItem.selection_set_id == selection.id,
            Photo.order_id == order.id,
            SelectionItem.photo_id.in_(ids),
        )
        .distinct()
        .all()
        if ids
        else []
    )
    if {r.photo_id for r in offered} != set(ids):
        raise ValidationException("Photo is not published in this order selection")


def change_selection(
    db, user, order_id, expected_revision, ids, *, operation="replace", submit=False, legacy=False
):
    lock_user(db, user)
    order = order_access(db, order_id, user, lock=True)
    selection = selection_for_order(db, order, user)
    state = selection_state(db, order, selection)
    ids = sorted(ids)
    if state["status"] == "submitted":
        # Deterministic same-outcome retry; never repeat tasks/timeline effects.
        if submit and not legacy and (not ids or ids == sorted(state["selected_photo_ids"])):
            return state
        raise ConflictException("Selection already submitted")
    if expected_revision != state["revision"]:
        revision_conflict(state)
    selection_for_order(db, order, user, editable=True)
    if operation == "add":
        if len(set(ids)) != len(ids):
            raise ValidationException("Duplicate photo IDs")
        ids = sorted(set(state["selected_photo_ids"]) | set(ids))
    elif operation == "remove":
        # Even removed IDs must refer to this published set, not arbitrary assets.
        offered = (
            db.query(SelectionItem.photo_id)
            .join(Photo, Photo.id == SelectionItem.photo_id)
            .filter(
                SelectionItem.selection_set_id == selection.id,
                Photo.order_id == order.id,
                SelectionItem.photo_id.in_(ids),
            )
            .distinct()
            .all()
            if ids
            else []
        )
        if {r.photo_id for r in offered} != set(ids):
            raise ValidationException("Photo is not published in this order selection")
        ids = sorted(set(state["selected_photo_ids"]) - set(ids))
    validate_selection_ids(db, order, selection, ids, final=submit)
    draft = db.get(CustomerSelectionDraft, selection.id)
    revision = state["revision"] + 1
    if draft:
        result = db.execute(
            update(CustomerSelectionDraft)
            .where(
                CustomerSelectionDraft.selection_set_id == selection.id,
                CustomerSelectionDraft.revision == expected_revision,
            )
            .values(revision=revision, selected_photo_ids=ids, updated_at=utcnow())
        )
        if result.rowcount != 1:
            db.expire_all()
            revision_conflict(selection_state(db, order, selection))
    else:
        db.add(
            CustomerSelectionDraft(
                selection_set_id=selection.id,
                user_id=user.id,
                revision=revision,
                selected_photo_ids=ids,
                updated_at=utcnow(),
            )
        )
    if submit:
        # Existing state machine and original domain effects, in the same transaction.
        new_status = OrderStateMachine.transition(
            OrderStatus(order.status), OrderStatus.WAITING_RETOUCH, user.role
        ).value
        changed = db.execute(
            update(Order)
            .where(Order.id == order.id, Order.status == "WAITING_SELECTION")
            .values(status=new_status)
        )
        if changed.rowcount != 1:
            raise ConflictException("Order changed")
        db.add(
            SelectionSubmission(
                selection_set_id=selection.id, selected_photo_ids=",".join(map(str, ids))
            )
        )
        db.add(
            OrderTimeline(
                order_id=order.id,
                from_status="WAITING_SELECTION",
                to_status=new_status,
                actor_id=user.id,
                action="submit_selection",
            )
        )
        db.add_all([RetouchTask(order_id=order.id, photo_id=pid, status="pending") for pid in ids])
    db.commit()
    db.expire_all()
    return selection_state(db, db.get(Order, order.id), db.get(SelectionSet, selection.id))
