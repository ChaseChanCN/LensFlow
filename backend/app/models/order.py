"""Order and OrderTimeline models."""

from datetime import datetime
from typing import Literal

from sqlalchemy import String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin

OrderStatusType = Literal[
    "PENDING_CONFIRM",
    "CONFIRMED",
    "WAITING_SHOOT",
    "WAITING_UPLOAD",
    "ANALYZING",
    "WAITING_REVIEW",
    "WAITING_SELECTION",
    "WAITING_RETOUCH",
    "RETOUCHING",
    "WAITING_CLIENT_CONFIRM",
    "WAITING_DELIVERY",
    "DELIVERED",
    "ARCHIVED",
    "CANCELLED",
]


class Order(Base, IdMixin, TimestampMixin):
    __tablename__ = "orders"

    booking_id: Mapped[int] = mapped_column(nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(nullable=False, index=True)
    photographer_id: Mapped[int] = mapped_column(nullable=False, index=True)
    status: Mapped[OrderStatusType] = mapped_column(
        String(30), nullable=False, default="PENDING_CONFIRM", index=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)


class OrderTimeline(Base, IdMixin):
    __tablename__ = "order_timelines"

    order_id: Mapped[int] = mapped_column(nullable=False, index=True)
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[int] = mapped_column(nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
