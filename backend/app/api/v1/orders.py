"""Order API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import NotFoundException
from app.deps import get_current_user
from app.models.order import Order, OrderTimeline
from app.models.todo import TodoItem
from app.models.user import User
from app.schemas.order import (
    OrderResponse,
    OrderStatusUpdateRequest,
    OrderTimelineResponse,
)
from app.services.order_state import OrderStateMachine, OrderStatus

router = APIRouter(prefix="/orders", tags=["orders"])

TODO_TEMPLATES = {
    OrderStatus.WAITING_UPLOAD: ("upload_photos", "上传拍摄照片"),
    OrderStatus.WAITING_REVIEW: ("review_analysis", "复核 AI 初筛结果"),
    OrderStatus.WAITING_SELECTION: ("publish_selection", "发布客户选片集"),
    OrderStatus.WAITING_RETOUCH: ("start_retouch", "开始修图处理"),
    OrderStatus.WAITING_DELIVERY: ("upload_delivery", "上传最终成片"),
}


@router.get("", response_model=list[OrderResponse])
def list_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Order)
    if current_user.role == "client":
        query = query.filter(Order.client_id == current_user.id)
    elif current_user.role == "photographer":
        query = query.filter(Order.photographer_id == current_user.id)
    return query.order_by(Order.created_at.desc()).all()


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException("Order")
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    req: OrderStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException("Order")

    from_status = OrderStatus(order.status)
    new_status = OrderStateMachine.transition(
        from_status=from_status,
        to_status=req.target_status,
        actor_role=current_user.role,
    )

    old_status = order.status
    order.status = new_status.value

    timeline = OrderTimeline(
        order_id=order.id,
        from_status=old_status,
        to_status=new_status.value,
        actor_id=current_user.id,
        action=req.action,
    )
    db.add(timeline)

    if new_status in TODO_TEMPLATES:
        todo_type, todo_title = TODO_TEMPLATES[new_status]
        assignee_id = (
            order.photographer_id
            if current_user.role in ("system", "photographer")
            else order.photographer_id
        )
        todo = TodoItem(
            assignee_id=assignee_id,
            order_id=order.id,
            type=todo_type,
            title=todo_title,
        )
        db.add(todo)

    db.commit()
    db.refresh(order)
    return order


@router.get("/{order_id}/timeline", response_model=list[OrderTimelineResponse])
def get_order_timeline(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timelines = (
        db.query(OrderTimeline)
        .filter(OrderTimeline.order_id == order_id)
        .order_by(OrderTimeline.created_at.desc())
        .all()
    )
    return timelines
