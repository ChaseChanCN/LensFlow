"""Delivery schemas."""

from datetime import datetime

from pydantic import BaseModel


class DeliveryResponse(BaseModel):
    id: int
    order_id: int
    storage_key: str
    filename: str
    delivered_at: datetime

    model_config = {"from_attributes": True}
