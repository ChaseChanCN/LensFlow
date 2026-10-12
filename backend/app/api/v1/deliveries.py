"""Delivery API routes: S6-T03, S6-T04, S6-T05."""

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from app.deps import require_role
from app.models.delivery import Delivery
from app.models.order import Order, OrderTimeline
from app.models.user import User
from app.schemas.delivery import DeliveryResponse
from app.services.notification_service import send_notification
from app.services.order_state import OrderStateMachine, OrderStatus
from app.services.storage import get_storage

MAX_FILE_SIZE = 100 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png", "application/zip"}

router = APIRouter(tags=["deliveries"])


@router.post(
    "/orders/{order_id}/delivery",
    response_model=DeliveryResponse,
    status_code=201,
)
async def upload_delivery(
    order_id: int,
    file: UploadFile,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException("Order")

    if order.status != OrderStatus.WAITING_DELIVERY.value:
        raise ConflictException(
            message="Order must be in WAITING_DELIVERY state"
        )

    if file.content_type not in ALLOWED_MIME:
        raise ValidationException(detail="Only JPEG/PNG/ZIP files are supported")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValidationException(detail="File size exceeds 100MB limit")
    if len(content) == 0:
        raise ValidationException(detail="Empty file")

    storage = get_storage()
    storage_key = storage.save(file.filename or "delivery.zip", content, file.content_type)

    delivery = Delivery(
        order_id=order_id,
        storage_key=storage_key,
        filename=file.filename or "delivery.zip",
    )
    db.add(delivery)

    old_status = order.status
    new_status = OrderStateMachine.transition(
        from_status=OrderStatus.WAITING_DELIVERY,
        to_status=OrderStatus.DELIVERED,
        actor_role=current_user.role,
    )
    order.status = new_status.value
    timeline = OrderTimeline(
        order_id=order.id,
        from_status=old_status,
        to_status=new_status.value,
        actor_id=current_user.id,
        action="upload_delivery",
    )
    db.add(timeline)

    db.commit()
    db.refresh(delivery)

    send_notification(db, "delivery_complete", order=order)

    return delivery


@router.get("/orders/{order_id}/delivery", response_model=DeliveryResponse)
def get_delivery(
    order_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException("Order")

    delivery = db.query(Delivery).filter(Delivery.order_id == order_id).first()
    if not delivery:
        raise NotFoundException("Delivery")

    if current_user.role == "client" and order.client_id != current_user.id:
        raise ForbiddenException(detail="Access denied")
    if current_user.role == "photographer" and order.photographer_id != current_user.id:
        raise ForbiddenException(detail="Access denied")

    return delivery


@router.get("/deliveries/{delivery_id}/download")
def download_delivery(
    delivery_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise NotFoundException("Delivery")

    order = db.query(Order).filter(Order.id == delivery.order_id).first()
    if not order:
        raise NotFoundException("Order")

    if current_user.role == "client" and order.client_id != current_user.id:
        raise ForbiddenException(detail="Access denied")
    if current_user.role == "photographer" and order.photographer_id != current_user.id:
        raise ForbiddenException(detail="Access denied")

    storage = get_storage()
    file_path = storage.get_path(delivery.storage_key)
    if not storage.exists(delivery.storage_key):
        raise NotFoundException("Delivery file")

    return FileResponse(
        path=file_path,
        filename=delivery.filename,
        media_type="application/octet-stream",
    )


@router.patch("/orders/{order_id}/archive", response_model=DeliveryResponse)
def archive_order(
    order_id: int,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException("Order")

    if order.status != OrderStatus.DELIVERED.value:
        raise ConflictException(message="Order must be in DELIVERED state")

    old_status = order.status
    new_status = OrderStateMachine.transition(
        from_status=OrderStatus.DELIVERED,
        to_status=OrderStatus.ARCHIVED,
        actor_role=current_user.role,
    )
    order.status = new_status.value
    timeline = OrderTimeline(
        order_id=order.id,
        from_status=old_status,
        to_status=new_status.value,
        actor_id=current_user.id,
        action="archive",
    )
    db.add(timeline)
    db.commit()

    delivery = db.query(Delivery).filter(Delivery.order_id == order_id).first()
    if not delivery:
        raise NotFoundException("Delivery")
    return delivery
