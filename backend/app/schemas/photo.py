"""Photo schemas."""

from datetime import datetime

from pydantic import BaseModel


class PhotoResponse(BaseModel):
    id: int
    order_id: int
    filename: str
    storage_key: str
    mime: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PhotoUploadResponse(BaseModel):
    photo: PhotoResponse
    analysis_triggered: bool
