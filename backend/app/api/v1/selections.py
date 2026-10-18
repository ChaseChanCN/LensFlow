"""Selection API routes: S5-T01, S5-T02, S5-T03, S5-T04."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.deps import require_role
from app.models.order import OrderTimeline
from app.models.photo import Photo
from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
from app.models.user import User
from app.schemas.selection import (
    SelectionSetCreateRequest,
    SelectionSetResponse,
    SelectionSubmissionResponse,
    SelectionSubmitRequest,
)
from app.services.customer_workflow import (
    change_selection,
    order_access,
    selection_state,
)
from app.services.notification_service import send_notification
from app.services.order_state import OrderStateMachine, OrderStatus

router = APIRouter(tags=["selections"])


@router.post(
    "/orders/{order_id}/selection-set",
    response_model=SelectionSetResponse,
    status_code=201,
)
def create_selection_set(
    order_id: int,
    req: SelectionSetCreateRequest,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    order = order_access(db, order_id, current_user, lock=True)

    if order.status not in (
        OrderStatus.WAITING_REVIEW.value,
        OrderStatus.WAITING_SELECTION.value,
    ):
        raise ConflictException(
            message="Order must be in WAITING_REVIEW or WAITING_SELECTION state"
        )

    if not req.photo_ids:
        raise ValidationException(detail="At least one photo is required")

    photos = db.query(Photo).filter(Photo.order_id == order_id, Photo.id.in_(req.photo_ids)).all()
    if len(photos) != len(req.photo_ids):
        raise ValidationException(detail="Some photos not found in this order")

    existing = db.query(SelectionSet).filter(SelectionSet.order_id == order_id).first()
    if existing:
        raise ConflictException(message="Selection set already exists for this order")

    selection_set = SelectionSet(
        order_id=order_id,
        max_select=req.max_select,
        expires_at=req.expires_at.astimezone(timezone.utc).replace(tzinfo=None)
        if req.expires_at
        else None,
        published_at=datetime.now(timezone.utc),
    )
    db.add(selection_set)
    db.flush()

    for photo_id in req.photo_ids:
        item = SelectionItem(
            selection_set_id=selection_set.id,
            photo_id=photo_id,
        )
        db.add(item)

    if order.status == OrderStatus.WAITING_REVIEW.value:
        old_status = order.status
        new_status = OrderStateMachine.transition(
            from_status=OrderStatus.WAITING_REVIEW,
            to_status=OrderStatus.WAITING_SELECTION,
            actor_role=current_user.role,
        )
        order.status = new_status.value
        timeline = OrderTimeline(
            order_id=order.id,
            from_status=old_status,
            to_status=new_status.value,
            actor_id=current_user.id,
            action="publish_selection",
        )
        db.add(timeline)

    db.commit()
    db.refresh(selection_set)

    send_notification(db, "selection_published", order=order)

    return legacy_selection(db, selection_set, current_user)


@router.get("/selection-sets/{selection_set_id}", response_model=SelectionSetResponse)
def get_selection_set(
    selection_set_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    selection_set = db.query(SelectionSet).filter(SelectionSet.id == selection_set_id).first()
    if not selection_set:
        raise NotFoundException("SelectionSet")
    return legacy_selection(db, selection_set, current_user)


@router.get(
    "/orders/{order_id}/selection-set",
    response_model=SelectionSetResponse,
)
def get_order_selection_set(
    order_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    selection_set = db.query(SelectionSet).filter(SelectionSet.order_id == order_id).first()
    if not selection_set:
        raise NotFoundException("SelectionSet")
    return legacy_selection(db, selection_set, current_user)


@router.post(
    "/selection-sets/{selection_set_id}/submit",
    response_model=SelectionSubmissionResponse,
    status_code=201,
)
def submit_selection(
    selection_set_id: int,
    req: SelectionSubmitRequest,
    current_user: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    selection_set = db.query(SelectionSet).filter(SelectionSet.id == selection_set_id).first()
    if not selection_set:
        raise NotFoundException("SelectionSet")

    change_selection(
        db,
        current_user,
        selection_set.order_id,
        req.expected_revision,
        req.selected_photo_ids,
        submit=True,
        legacy=True,
    )
    return db.query(SelectionSubmission).filter_by(selection_set_id=selection_set_id).one()


@router.get(
    "/selection-sets/{selection_set_id}/submission",
    response_model=SelectionSubmissionResponse,
)
def get_submission(
    selection_set_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    selection_set = db.get(SelectionSet, selection_set_id)
    if not selection_set:
        raise NotFoundException("SelectionSet")
    legacy_selection(db, selection_set, current_user)
    submission = (
        db.query(SelectionSubmission)
        .filter(SelectionSubmission.selection_set_id == selection_set_id)
        .first()
    )
    if not submission:
        raise NotFoundException("SelectionSubmission")
    return submission


def legacy_selection(db, selection, user):
    order = order_access(db, selection.order_id, user)
    if user.role == "client" and not selection.published_at:
        raise NotFoundException("Published selection")
    state = selection_state(db, order, selection)
    selection.revision = state["revision"]
    selection.draft_selected_photo_ids = state["selected_photo_ids"]
    selection.submitted = state["status"] == "submitted"
    return selection
