"""Retouch models: RetouchTask, RetouchVersion, RetouchFeedback."""

from datetime import datetime
from typing import Literal

from sqlalchemy import String, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class RetouchTask(Base, IdMixin):
    __tablename__ = "retouch_tasks"

    order_id: Mapped[int] = mapped_column(nullable=False, index=True)
    photo_id: Mapped[int] = mapped_column(nullable=False, index=True)
    status: Mapped[Literal["pending", "in_progress", "preview_uploaded", "confirmed", "rejected"]] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    due_date: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class RetouchVersion(Base, IdMixin):
    __tablename__ = "retouch_versions"

    retouch_task_id: Mapped[int] = mapped_column(nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    uploaded_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class RetouchFeedback(Base, IdMixin):
    __tablename__ = "retouch_feedbacks"

    retouch_task_id: Mapped[int] = mapped_column(nullable=False, index=True)
    version_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
