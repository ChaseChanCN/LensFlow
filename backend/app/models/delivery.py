"""Delivery model."""

from datetime import datetime
from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class Delivery(Base, IdMixin):
    __tablename__ = "deliveries"

    order_id: Mapped[int] = mapped_column(nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
