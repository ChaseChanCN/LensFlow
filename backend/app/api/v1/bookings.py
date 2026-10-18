"""Booking API routes."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ConflictException, ForbiddenException
from app.deps import get_current_user, require_role
from app.models.booking import Booking
from app.models.order import Order
from app.models.user import User
from app.schemas.booking import (
    BookingConfirmRequest,
    BookingCreateRequest,
    BookingResponse,
    BookingUpdateRequest,
)
from app.services.customer_workflow import booking_access
from app.services.customer_workflow import create_booking as save_booking
from app.services.order_state import OrderStatus

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingResponse, status_code=201)
def create_booking(
    req: BookingCreateRequest,
    idempotency_key: str | None = Header(default=None, max_length=128),
    current_user: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    return save_booking(db, current_user, req, idempotency_key)


@router.get("", response_model=list[BookingResponse])
def list_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Booking)
    if current_user.role == "client":
        query = query.filter(Booking.client_id == current_user.id)
    elif current_user.role == "photographer":
        query = query.filter(
            or_(
                Booking.photographer_id == current_user.id,
                and_(Booking.photographer_id.is_(None), Booking.status == "pending"),
            )
        )
    return query.order_by(Booking.created_at.desc()).all()


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = booking_access(db, booking_id, current_user)
    return booking


@router.patch("/{booking_id}", response_model=BookingResponse)
def update_booking(
    booking_id: int,
    req: BookingUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = booking_access(db, booking_id, current_user, lock=True)
    if current_user.role == "client" and booking.client_id != current_user.id:
        raise ForbiddenException()
    if (
        current_user.role == "photographer"
        and booking.photographer_id is not None
        and booking.photographer_id != current_user.id
    ):
        raise ForbiddenException()
    if booking.status != "pending":
        raise ConflictException(message="Only pending booking can be modified")
    data = req.model_dump(exclude_unset=True)
    if any(data.get(field, "omitted") is None for field in ("shoot_type", "contact_info")):
        from app.core.exceptions import ValidationException

        raise ValidationException("shoot_type/contact_info cannot be null")
    result = (
        db.execute(
            update(Booking)
            .where(Booking.id == booking_id, Booking.status == "pending")
            .values(**data)
        )
        if data
        else None
    )
    if result is not None and result.rowcount != 1:
        raise ConflictException("Booking changed")
    db.commit()
    db.refresh(booking)
    return booking


@router.patch("/{booking_id}/confirm", response_model=BookingResponse)
def confirm_booking(
    booking_id: int,
    req: BookingConfirmRequest,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    booking = booking_access(db, booking_id, current_user, lock=True)
    if booking.status != "pending":
        raise ConflictException(message="Booking is not pending")

    changed = db.execute(
        update(Booking)
        .where(Booking.id == booking_id, Booking.status == "pending")
        .values(status="confirmed", photographer_id=current_user.id)
    )
    if changed.rowcount != 1:
        raise ConflictException("Booking changed")

    order = Order(
        booking_id=booking.id,
        client_id=booking.client_id,
        photographer_id=current_user.id,
        status=OrderStatus.CONFIRMED.value,
    )
    db.add(order)
    db.commit()
    db.refresh(booking)
    return booking


@router.patch("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = booking_access(db, booking_id, current_user, lock=True)
    if booking.status in ("confirmed", "cancelled"):
        raise ConflictException(message="Booking cannot be cancelled")

    changed = db.execute(
        update(Booking)
        .where(Booking.id == booking_id, Booking.status == "pending")
        .values(status="cancelled")
    )
    if changed.rowcount != 1:
        raise ConflictException("Booking changed")
    db.commit()
    db.refresh(booking)
    return booking
