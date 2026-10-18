"""Selection schemas."""

from datetime import datetime

from pydantic import BaseModel, Field, StrictInt, AwareDatetime


class SelectionSetCreateRequest(BaseModel):
    photo_ids: list[StrictInt] = Field(min_length=1, max_length=10000)
    max_select: int = Field(default=3, ge=1, le=100)
    expires_at: AwareDatetime | None = None


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
    revision: int = 0
    draft_selected_photo_ids: list[int] = []
    submitted: bool = False

    model_config = {"from_attributes": True}


class SelectionSubmitRequest(BaseModel):
    selected_photo_ids: list[StrictInt] = Field(min_length=1, max_length=100)
    expected_revision: StrictInt = Field(default=0, ge=0, le=2**31 - 2)


class SelectionSubmissionResponse(BaseModel):
    id: int
    selection_set_id: int
    selected_photo_ids: str
    submitted_at: datetime

    model_config = {"from_attributes": True}
