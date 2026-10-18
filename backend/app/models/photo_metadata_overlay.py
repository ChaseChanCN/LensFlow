"""Editable authority and disposable keyword projection are deliberately separate."""

from sqlalchemy import (
    JSON,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    column,
    func,
    or_,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class PhotoMetadataOverlay(Base, IdMixin, TimestampMixin):
    __tablename__ = "photo_metadata_overlays"
    __table_args__ = (
        UniqueConstraint("photo_id", "user_id", name="uq_metadata_overlay_owner"),
        CheckConstraint("revision >= 1", name="ck_overlay_revision"),
        *[
            CheckConstraint(
                f"({name}_mode IN ('inherit','clear') AND {name}_value IS NULL) OR "
                f"({name}_mode = 'override' AND {name}_value IS NOT NULL"
                + (
                    f" AND length({name}_value) BETWEEN 1 AND {limit})"
                    if name != "keywords"
                    else " AND json_array_length(keywords_value) BETWEEN 0 AND 64"
                    " AND length(CAST(keywords_value AS TEXT)) <= 65536)"
                ),
                name=f"ck_overlay_{name}",
            )
            for name, limit in [
                ("title", 512),
                ("caption", 8192),
                ("creator", 512),
                ("copyright", 1024),
                ("keywords", 0),
            ]
        ],
        CheckConstraint("length(source_sha256) = 64", name="ck_overlay_sha"),
        *[
            CheckConstraint(
                or_(
                    column("keywords_mode") != "override",
                    func.json_array_length(column("keywords_value")) <= i,
                    func.length(
                        func.coalesce(column("keywords_value", JSON)[i].as_string(), "")
                    ).between(1, 128),
                ),
                name=f"ck_overlay_keyword_{i}",
            )
            for i in range(64)
        ],
    )
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    title_mode: Mapped[str] = mapped_column(String(8), nullable=False)
    title_value: Mapped[str | None] = mapped_column(String(512))
    caption_mode: Mapped[str] = mapped_column(String(8), nullable=False)
    caption_value: Mapped[str | None] = mapped_column(String(8192))
    creator_mode: Mapped[str] = mapped_column(String(8), nullable=False)
    creator_value: Mapped[str | None] = mapped_column(String(512))
    copyright_mode: Mapped[str] = mapped_column(String(8), nullable=False)
    copyright_value: Mapped[str | None] = mapped_column(String(1024))
    keywords_mode: Mapped[str] = mapped_column(String(8), nullable=False)
    keywords_value: Mapped[list | None] = mapped_column(JSON(none_as_null=True))


class PhotoKeywordState(Base, IdMixin, TimestampMixin):
    __tablename__ = "photo_keyword_states"
    __table_args__ = (
        UniqueConstraint("photo_id", "user_id", name="uq_keyword_state_owner"),
        CheckConstraint("overlay_revision >= 0", name="ck_keyword_revision"),
        CheckConstraint("length(source_sha256) = 64", name="ck_keyword_sha"),
        CheckConstraint("length(parser_version) BETWEEN 1 AND 32", name="ck_keyword_parser"),
    )
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(32), nullable=False)
    overlay_revision: Mapped[int] = mapped_column(Integer, nullable=False)


class PhotoEffectiveKeyword(Base, IdMixin):
    __tablename__ = "photo_effective_keywords"
    __table_args__ = (
        UniqueConstraint("state_id", "keyword_key", name="uq_effective_keyword"),
        UniqueConstraint("state_id", "position", name="uq_effective_position"),
        CheckConstraint("position BETWEEN 0 AND 63", name="ck_effective_position"),
        CheckConstraint("length(keyword_key) BETWEEN 1 AND 256", name="ck_keyword_key"),
        CheckConstraint("length(display) BETWEEN 1 AND 128", name="ck_keyword_display"),
    )
    state_id: Mapped[int] = mapped_column(
        ForeignKey("photo_keyword_states.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword_key: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    display: Mapped[str] = mapped_column(String(128), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
