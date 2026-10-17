from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.image_edit import AnyEditParameters


class SavePhotoEditDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parameters: AnyEditParameters
    expected_revision: Annotated[int, Field(strict=True, ge=0, le=2147483646)]
    expected_source_sha256: Annotated[str, Field(strict=True, pattern=r"^[0-9a-f]{64}$")]


class PhotoEditDraftResponse(BaseModel):
    photo_id: int
    exists: bool
    parameters: AnyEditParameters
    revision: int
    source_sha256: str
    updated_at: datetime | None

    @field_validator("updated_at")
    @classmethod
    def utc_timestamp(cls, value):
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value
