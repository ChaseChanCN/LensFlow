"""Whitelisted metadata; no storage keys in catalog responses."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_validator
from app.schemas.photo_annotation import AnnotationResponse


class PhotoAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: int
    filename: str
    mime: str
    size_bytes: int
    width: int | None
    height: int | None
    created_at: datetime
    annotation: AnnotationResponse | None = None

    @field_validator("created_at")
    @classmethod
    def utc_date(cls, value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class PhotoCatalogResponse(BaseModel):
    items: list[PhotoAssetResponse]
    next_cursor: str | None
    has_more: bool
