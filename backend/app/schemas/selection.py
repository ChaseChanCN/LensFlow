"""Selection schemas."""

from datetime import datetime

from pydantic import BaseModel


class SelectionSetCreateRequest(BaseModel):
    photo_ids: list[int]
    max_select: int = 3
    expires_at: datetime | None = None


class SelectionItemResponse(BaseModel):
    id: int
    selection_set_id: int
    photo_id: int

    model_config = {"from_attributes": True}


class SelectionSetResponse(BaseModel):
    id: int
    order_id: int
    max_select: int
    expires_at: datetime | None = None
    published_at: datetime | None = None
    created_at: datetime
    items: list[SelectionItemResponse] = []

    model_config = {"from_attributes": True}


class SelectionSubmitRequest(BaseModel):
    selected_photo_ids: list[int]


class SelectionSubmissionResponse(BaseModel):
    id: int
    selection_set_id: int
    selected_photo_ids: str
    submitted_at: datetime

    model_config = {"from_attributes": True}
