"""Todo schemas."""

from datetime import datetime

from pydantic import BaseModel


class TodoResponse(BaseModel):
    id: int
    assignee_id: int
    order_id: int | None = None
    type: str
    title: str
    due_date: datetime | None = None
    done: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TodoUpdateRequest(BaseModel):
    done: bool
