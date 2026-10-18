"""Platform-neutral whitelisted customer DTOs. No storage/private editor fields."""

from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from app.services.order_state import OrderStatus

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_after: int | None = None


class AppointmentSummary(BaseModel):
    id: int
    shoot_type: str
    preferred_date: date | None
    location: str | None
    duration_hours: float | None
    status: str


class CustomerOrder(BaseModel):
    id: int
    status: OrderStatus
    created_at: datetime
    updated_at: datetime
    booking: AppointmentSummary | None
    selection_available: bool
    delivery_available: bool


class CustomerPhoto(BaseModel):
    id: int
    order_id: int
    width: int | None
    height: int | None
    selected: bool
    thumbnail_available: bool
    preview_available: bool


class SelectionState(BaseModel):
    id: int
    order_id: int
    revision: int
    selected_photo_ids: list[int]
    max_select: int
    status: Literal["draft", "submitted"]
    editable: bool
    can_submit: bool
    expires_at: datetime | None
    published_at: datetime | None


class SelectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: StrictInt = Field(ge=0, le=2**31 - 2)
    selected_photo_ids: list[StrictInt] = Field(max_length=100)
    operation: Literal["replace", "add", "remove"] = "replace"

    @model_validator(mode="after")
    def validate_ids(self):
        if any(i <= 0 or i > 2**31 - 1 for i in self.selected_photo_ids):
            raise ValueError("Invalid photo ID")
        if len(set(self.selected_photo_ids)) != len(self.selected_photo_ids):
            raise ValueError("Duplicate photo IDs")
        return self


class SelectionFinalize(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: StrictInt = Field(ge=0, le=2**31 - 2)


class CustomerDelivery(BaseModel):
    id: int
    order_id: int
    filename: str
    delivered_at: datetime
    media_type: str | None
    size_bytes: int | None
    download_available: bool
    preview_available: bool


class MediaGrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["photo", "delivery"]
    media_id: StrictInt = Field(gt=0, le=2**31 - 1)
    variant: Literal["thumbnail", "preview", "download"]
    size: Literal[128, 256, 512, 1024] | None = None

    @model_validator(mode="after")
    def precise_variant(self):
        if self.variant == "thumbnail" and (
            self.kind != "photo" or self.size not in (128, 256, 512)
        ):
            raise ValueError("Photo thumbnail requires size 128, 256 or 512")
        if self.variant == "preview" and self.size != 1024:
            raise ValueError("Preview size must be 1024")
        if self.variant == "download" and (self.kind != "delivery" or self.size is not None):
            raise ValueError("Only a delivered file can be downloaded; omit size")
        return self


class MediaGrantResponse(BaseModel):
    token: str
    expires_at: datetime
    download_path: Literal["/api/v1/customer/media"] = "/api/v1/customer/media"
    authorization_scheme: Literal["MediaGrant"] = "MediaGrant"
    reusable: Literal[True] = True
