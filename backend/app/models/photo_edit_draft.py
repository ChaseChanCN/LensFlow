"""Mutable editing state, separate from delivered/retouch artifacts."""

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class PhotoEditDraft(Base, IdMixin, TimestampMixin):
    __tablename__ = "photo_edit_drafts"
    __table_args__ = (
        UniqueConstraint("photo_id", "user_id", name="uq_photo_edit_draft_owner"),
        CheckConstraint("revision >= 0", name="ck_photo_edit_draft_revision"),
    )

    photo_id: Mapped[int] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parameters_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
