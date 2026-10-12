"""Order schemas."""

from datetime import datetime

from pydantic import BaseModel

from app.services.order_state import OrderStatus


class OrderResponse(BaseModel):
    id: int
    booking_id: int
    client_id: int
    photographer_id: int
    status: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None

    model_config = {"from_attributes": True}


class OrderStatusUpdateRequest(BaseModel):
    target_status: OrderStatus
    action: str = "status_change"


class OrderTimelineResponse(BaseModel):
    id: int
    order_id: int
    from_status: str | None = None
    to_status: str
    actor_id: int
    action: str
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
