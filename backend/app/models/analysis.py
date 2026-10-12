"""AnalysisResult model."""

from datetime import datetime
from typing import Literal

from sqlalchemy import Boolean, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class AnalysisResult(Base, IdMixin):
    __tablename__ = "analysis_results"

    photo_id: Mapped[int] = mapped_column(nullable=False, index=True)
    sharpness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    brightness_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    highlight_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    shadow_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    suggestion: Mapped[Literal["suggest_exclude", "need_review", "no_issue"]] = mapped_column(
        String(20), nullable=False, default="no_issue"
    )
    risk_level: Mapped[Literal["high", "medium", "low"]] = mapped_column(
        String(10), nullable=False, default="low"
    )
    reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reviewer_id: Mapped[int | None] = mapped_column(nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    final_decision: Mapped[Literal["exclude", "keep", "pending"]] = mapped_column(
        String(10), nullable=False, default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
