"""Private photographer organization, independent from client selections and edits."""
from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, IdMixin, TimestampMixin


class PhotoAssetAnnotation(Base, IdMixin, TimestampMixin):
    __tablename__ = "photo_asset_annotations"
    __table_args__ = (
        UniqueConstraint("photo_id", "user_id", name="uq_photo_annotation_owner"),
        CheckConstraint("rating >= 0 AND rating <= 5", name="ck_photo_annotation_rating"),
        CheckConstraint("revision >= 0", name="ck_photo_annotation_revision"),
        CheckConstraint("color_label IS NULL OR color_label IN ('red','yellow','green','blue','purple')", name="ck_photo_annotation_color"),
        CheckConstraint("pick_status IN ('unmarked','pick','reject')", name="ck_photo_annotation_pick"),
    )
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color_label: Mapped[str | None] = mapped_column(String(12), nullable=True)
    pick_status: Mapped[str] = mapped_column(String(12), nullable=False, default="unmarked")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
