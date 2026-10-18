"""Companion reliability state; Booking/Selection remain the business authority."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class BookingRequestKey(Base, IdMixin):
    __tablename__ = "booking_request_keys"
    __table_args__ = (UniqueConstraint("user_id", "key_hash", name="uq_booking_request_user_key"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key_hash: Mapped[str] = mapped_column(String(64))
    payload_hash: Mapped[str] = mapped_column(String(64))
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class CustomerSelectionDraft(Base):
    __tablename__ = "customer_selection_drafts"
    __table_args__ = (CheckConstraint("revision > 0", name="ck_customer_selection_revision"),)
    selection_set_id: Mapped[int] = mapped_column(
        ForeignKey("selection_sets.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_photo_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
