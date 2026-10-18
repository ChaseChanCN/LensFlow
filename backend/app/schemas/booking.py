"""Booking schemas."""

import re
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


def preferred_date_only(value):
    if value is None or (type(value) is date):
        return value
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("preferred_date must be a calendar date YYYY-MM-DD, not an instant")
    return value


class BookingCreateRequest(BaseModel):
    shoot_type: str = Field(min_length=1, max_length=50)
    preferred_date: date | None = None
    contact_info: str = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    duration_hours: float | None = Field(default=None, gt=0, le=24, allow_inf_nan=False)
    photographer_id: int | None = Field(default=None, gt=0, le=2**31 - 1)

    _date_only = field_validator("preferred_date", mode="before")(preferred_date_only)


class BookingUpdateRequest(BaseModel):
    shoot_type: str | None = Field(default=None, min_length=1, max_length=50)
    preferred_date: date | None = None
    contact_info: str | None = Field(default=None, min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    duration_hours: float | None = Field(default=None, gt=0, le=24, allow_inf_nan=False)

    _date_only = field_validator("preferred_date", mode="before")(preferred_date_only)


class BookingResponse(BaseModel):
    id: int
    client_id: int
    photographer_id: int | None = None
    shoot_type: str
    preferred_date: date | None = None
    contact_info: str
    note: str | None = None
    location: str | None = None
    duration_hours: float | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookingConfirmRequest(BaseModel):
    photographer_id: int
