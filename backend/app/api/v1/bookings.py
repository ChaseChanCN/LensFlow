"""Booking API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ConflictException, NotFoundException
from app.deps import get_current_user, require_role
from app.models.booking import Booking
from app.models.order import Order
from app.models.user import User
from app.schemas.booking import (
    BookingConfirmRequest,
    BookingCreateRequest,
    BookingResponse,
)
from app.services.order_state import OrderStatus

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingResponse, status_code=201)
def create_booking(
    req: BookingCreateRequest,
    current_user: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    booking = Booking(
        client_id=current_user.id,
        photographer_id=req.photographer_id,
        shoot_type=req.shoot_type,
        preferred_date=req.preferred_date,
        contact_info=req.contact_info,
        note=req.note,
        status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("", response_model=list[BookingResponse])
def list_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Booking)
    if current_user.role == "client":
        query = query.filter(Booking.client_id == current_user.id)
    elif current_user.role == "photographer":
        query = query.filter(Booking.photographer_id == current_user.id)
    return query.order_by(Booking.created_at.desc()).all()


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise NotFoundException("Booking")
    return booking


@router.patch("/{booking_id}/confirm", response_model=BookingResponse)
def confirm_booking(
    booking_id: int,
    req: BookingConfirmRequest,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise NotFoundException("Booking")
    if booking.status != "pending":
        raise ConflictException(message="Booking is not pending")

    booking.status = "confirmed"
    booking.photographer_id = current_user.id

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
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise NotFoundException("Booking")
    if booking.status in ("confirmed", "cancelled"):
        raise ConflictException(message="Booking cannot be cancelled")

    booking.status = "cancelled"
    db.commit()
    db.refresh(booking)
    return booking
