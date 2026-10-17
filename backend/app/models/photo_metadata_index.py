"""Rebuildable photographic metadata, never private raw metadata or manual decisions."""

from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin

_hex_remainder = "source_sha256"
for _digit in "0123456789abcdef":
    _hex_remainder = f"replace({_hex_remainder}, '{_digit}', '')"


class PhotoMetadataIndex(Base, IdMixin, TimestampMixin):
    __tablename__ = "photo_metadata_indexes"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','indexed','unsupported','failed')", name="ck_metadata_status"
        ),
        CheckConstraint(
            f"source_sha256 IS NULL OR (length(source_sha256)=64 AND length({_hex_remainder})=0)",
            name="ck_metadata_sha",
        ),
        CheckConstraint("length(parser_version) BETWEEN 1 AND 32", name="ck_metadata_parser"),
        CheckConstraint("revision >= 0", name="ck_metadata_revision"),
        CheckConstraint("iso IS NULL OR iso BETWEEN 1 AND 10000000", name="ck_metadata_iso"),
        CheckConstraint(
            "f_number IS NULL OR f_number BETWEEN 0.1 AND 1024", name="ck_metadata_aperture"
        ),
        CheckConstraint(
            "focal_length_mm IS NULL OR focal_length_mm BETWEEN 0.1 AND 100000",
            name="ck_metadata_focal",
        ),
        CheckConstraint(
            "exposure_seconds IS NULL OR exposure_seconds BETWEEN 0.0000001 AND 86400",
            name="ck_metadata_exposure",
        ),
        CheckConstraint(
            "capture_timezone_offset_minutes IS NULL OR "
            "capture_timezone_offset_minutes BETWEEN -840 AND 840",
            name="ck_metadata_offset",
        ),
        CheckConstraint(
            "(capture_timezone_known = false AND capture_timezone_offset_minutes IS NULL) OR "
            "(capture_timezone_known = true AND capture_timezone_offset_minutes IS NOT NULL)",
            name="ck_metadata_timezone",
        ),
        CheckConstraint(
            "status != 'indexed' OR (source_sha256 IS NOT NULL AND indexed_at IS NOT NULL)",
            name="ck_metadata_complete",
        ),
    )
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    source_sha256: Mapped[str | None] = mapped_column(String(64))
    parser_version: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    camera_make: Mapped[str | None] = mapped_column(String(160))
    camera_model: Mapped[str | None] = mapped_column(String(160), index=True)
    lens_make: Mapped[str | None] = mapped_column(String(160))
    lens_model: Mapped[str | None] = mapped_column(String(160), index=True)
    iso: Mapped[int | None] = mapped_column(Integer)
    focal_length_mm: Mapped[float | None] = mapped_column(Float)
    f_number: Mapped[float | None] = mapped_column(Float)
    exposure_seconds: Mapped[float | None] = mapped_column(Float)
    capture_datetime_local: Mapped[str | None] = mapped_column(String(32))
    capture_timezone_offset_minutes: Mapped[int | None] = mapped_column(Integer)
    capture_date: Mapped[date | None] = mapped_column(Date, index=True)
    capture_timezone_known: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_code: Mapped[str | None] = mapped_column(String(40))
    lease_token: Mapped[str | None] = mapped_column(String(32))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
