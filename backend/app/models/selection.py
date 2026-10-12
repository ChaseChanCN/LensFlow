"""Selection models: SelectionSet, SelectionItem, SelectionSubmission."""

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin


class SelectionSet(Base, IdMixin):
    __tablename__ = "selection_sets"

    order_id: Mapped[int] = mapped_column(nullable=False, index=True)
    max_select: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    items: Mapped[list["SelectionItem"]] = relationship(
        backref="selection_set", cascade="all, delete-orphan"
    )


class SelectionItem(Base, IdMixin):
    __tablename__ = "selection_items"

    selection_set_id: Mapped[int] = mapped_column(
        ForeignKey("selection_sets.id"), nullable=False, index=True
    )
    photo_id: Mapped[int] = mapped_column(nullable=False, index=True)


class SelectionSubmission(Base, IdMixin):
    __tablename__ = "selection_submissions"

    selection_set_id: Mapped[int] = mapped_column(nullable=False, index=True)
    selected_photo_ids: Mapped[str] = mapped_column(String(500), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
