"""Analysis schemas."""

from datetime import datetime

from pydantic import BaseModel


class AnalysisResultResponse(BaseModel):
    id: int
    photo_id: int
    sharpness_score: float | None = None
    brightness_mean: float | None = None
    highlight_ratio: float | None = None
    shadow_ratio: float | None = None
    suggestion: str
    risk_level: str
    reviewed: bool
    reviewer_id: int | None = None
    reviewed_at: datetime | None = None
    final_decision: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    final_decision: str  # "exclude" | "keep" | "pending"
    note: str | None = None
