"""Booking schemas."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class BookingCreateRequest(BaseModel):
    shoot_type: str = Field(min_length=1, max_length=50)
    preferred_date: date | None = None
    contact_info: str = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=2000)
    photographer_id: int | None = None


class BookingResponse(BaseModel):
    id: int
    client_id: int
    photographer_id: int | None = None
    shoot_type: str
    preferred_date: date | None = None
    contact_info: str
    note: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookingConfirmRequest(BaseModel):
    photographer_id: int
