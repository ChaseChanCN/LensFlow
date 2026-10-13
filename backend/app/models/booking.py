"""Booking model."""

from datetime import date
from typing import Literal

from sqlalchemy import String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Booking(Base, IdMixin, TimestampMixin):
    __tablename__ = "bookings"

    client_id: Mapped[int] = mapped_column(nullable=False, index=True)
    photographer_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    shoot_type: Mapped[str] = mapped_column(String(50), nullable=False)
    preferred_date: Mapped[date | None] = mapped_column(nullable=True)
    contact_info: Mapped[str] = mapped_column(String(500), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    duration_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[Literal["pending", "confirmed", "cancelled"]] = mapped_column(
        String(20), nullable=False, default="pending"
    )
