"""TodoItem model."""

from datetime import datetime

from sqlalchemy import Boolean, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class TodoItem(Base, IdMixin):
    __tablename__ = "todo_items"

    assignee_id: Mapped[int] = mapped_column(nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
