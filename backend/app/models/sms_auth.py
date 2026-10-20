"""Verified identities are separate from historical, unverified User.phone values."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PhoneIdentity(Base):
    __tablename__ = "phone_identities"
    phone: Mapped[str] = mapped_column(String(16), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    verified_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class SmsChallenge(Base):
    __tablename__ = "sms_challenges"
    __table_args__ = (
        CheckConstraint("purpose IN ('register','login')", name="ck_sms_purpose"),
        CheckConstraint("state IN ('sending','sent','failed','unknown')", name="ck_sms_state"),
        CheckConstraint("attempts BETWEEN 0 AND 5", name="ck_sms_attempts"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    phone: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(8), nullable=False)
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(8), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)


class SmsRateBucket(Base):
    __tablename__ = "sms_rate_buckets"
    __table_args__ = (CheckConstraint("count >= 0", name="ck_sms_rate_count"),)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
