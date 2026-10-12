"""Retouch schemas."""

from datetime import datetime

from pydantic import BaseModel


class RetouchTaskResponse(BaseModel):
    id: int
    order_id: int
    photo_id: int
    status: str
    due_date: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RetouchVersionResponse(BaseModel):
    id: int
    retouch_task_id: int
    storage_key: str
    version_no: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class RetouchFeedbackCreateRequest(BaseModel):
    content: str


class RetouchFeedbackResponse(BaseModel):
    id: int
    retouch_task_id: int
    version_id: int | None = None
    content: str
    author_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RetouchTaskStatusUpdateRequest(BaseModel):
    status: str
