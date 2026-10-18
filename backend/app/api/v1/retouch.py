"""Retouch API routes: S5-T05, S5-T06."""

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from app.deps import require_role
from app.models.order import Order, OrderTimeline
from app.models.retouch import RetouchFeedback, RetouchTask, RetouchVersion
from app.models.user import User
from app.schemas.retouch import (
    RetouchFeedbackCreateRequest,
    RetouchFeedbackResponse,
    RetouchTaskResponse,
    RetouchTaskStatusUpdateRequest,
    RetouchVersionResponse,
)
from app.services.customer_media import HEADERS
from app.services.customer_workflow import order_access
from app.services.notification_service import send_notification
from app.services.order_state import OrderStateMachine, OrderStatus
from app.services.storage import get_storage

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png"}

router = APIRouter(tags=["retouch"])


@router.get(
    "/orders/{order_id}/retouch-tasks",
    response_model=list[RetouchTaskResponse],
)
def list_retouch_tasks(
    order_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    order_access(db, order_id, current_user)
    return (
        db.query(RetouchTask)
        .filter(RetouchTask.order_id == order_id)
        .order_by(RetouchTask.id)
        .all()
    )


@router.post(
    "/retouch-tasks/{task_id}/versions",
    response_model=RetouchVersionResponse,
    status_code=201,
)
async def upload_retouch_version(
    task_id: int,
    file: UploadFile,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    task = db.query(RetouchTask).filter(RetouchTask.id == task_id).first()
    if not task:
        raise NotFoundException("RetouchTask")
    order_access(db, task.order_id, current_user, lock=True)

    if file.content_type not in ALLOWED_MIME:
        raise ValidationException(detail="Only JPEG/PNG images are supported")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise ValidationException(detail="File size exceeds 20MB limit")
    if len(content) == 0:
        raise ValidationException(detail="Empty file")

    storage = get_storage()
    storage_key = storage.save(file.filename or "retouch.jpg", content, file.content_type)

    version_count = (
        db.query(RetouchVersion).filter(RetouchVersion.retouch_task_id == task_id).count()
    )
    version_no = version_count + 1

    version = RetouchVersion(
        retouch_task_id=task_id,
        storage_key=storage_key,
        version_no=version_no,
    )
    db.add(version)

    task.status = "preview_uploaded"

    order = db.query(Order).filter(Order.id == task.order_id).first()
    if order and order.status == OrderStatus.WAITING_RETOUCH.value:
        old_status = order.status
        new_status = OrderStateMachine.transition(
            from_status=OrderStatus.WAITING_RETOUCH,
            to_status=OrderStatus.RETOUCHING,
            actor_role=current_user.role,
        )
        order.status = new_status.value
        timeline = OrderTimeline(
            order_id=order.id,
            from_status=old_status,
            to_status=new_status.value,
            actor_id=current_user.id,
            action="start_retouch",
        )
        db.add(timeline)

    db.commit()
    db.refresh(version)
    return version


@router.get(
    "/retouch-tasks/{task_id}/versions",
    response_model=list[RetouchVersionResponse],
)
def list_retouch_versions(
    task_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    task = db.get(RetouchTask, task_id)
    if not task:
        raise NotFoundException("RetouchTask")
    order_access(db, task.order_id, current_user)
    if current_user.role == "client":
        if task.status not in ("preview_uploaded", "confirmed", "rejected"):
            return JSONResponse([], headers=HEADERS)
        versions = (
            db.query(RetouchVersion)
            .filter_by(retouch_task_id=task_id)
            .order_by(RetouchVersion.version_no)
            .all()
        )
        return JSONResponse(
            [
                RetouchVersionResponse.model_validate(v).model_dump(
                    mode="json", exclude={"storage_key"}
                )
                for v in versions
            ],
            headers=HEADERS,
        )
    return (
        db.query(RetouchVersion)
        .filter(RetouchVersion.retouch_task_id == task_id)
        .order_by(RetouchVersion.version_no)
        .all()
    )


@router.post(
    "/retouch-tasks/{task_id}/feedback",
    response_model=RetouchFeedbackResponse,
    status_code=201,
)
def create_feedback(
    task_id: int,
    req: RetouchFeedbackCreateRequest,
    current_user: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    task = db.query(RetouchTask).filter(RetouchTask.id == task_id).first()
    if not task:
        raise NotFoundException("RetouchTask")
    order_access(db, task.order_id, current_user, lock=True)

    latest_version = (
        db.query(RetouchVersion)
        .filter(RetouchVersion.retouch_task_id == task_id)
        .order_by(RetouchVersion.version_no.desc())
        .first()
    )

    feedback = RetouchFeedback(
        retouch_task_id=task_id,
        version_id=latest_version.id if latest_version else None,
        content=req.content,
        author_id=current_user.id,
    )
    db.add(feedback)

    order = db.query(Order).filter(Order.id == task.order_id).first()
    if order and order.status == OrderStatus.WAITING_CLIENT_CONFIRM.value:
        old_status = order.status
        new_status = OrderStateMachine.transition(
            from_status=OrderStatus.WAITING_CLIENT_CONFIRM,
            to_status=OrderStatus.RETOUCHING,
            actor_role=current_user.role,
        )
        order.status = new_status.value
        timeline = OrderTimeline(
            order_id=order.id,
            from_status=old_status,
            to_status=new_status.value,
            actor_id=current_user.id,
            action="request_changes",
        )
        db.add(timeline)

    task.status = "rejected"
    db.commit()
    db.refresh(feedback)

    send_notification(db, "retouch_feedback", order=order)

    return feedback


@router.patch(
    "/retouch-tasks/{task_id}/status",
    response_model=RetouchTaskResponse,
)
def update_task_status(
    task_id: int,
    req: RetouchTaskStatusUpdateRequest,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    task = db.query(RetouchTask).filter(RetouchTask.id == task_id).first()
    if not task:
        raise NotFoundException("RetouchTask")
    order_access(db, task.order_id, current_user, lock=True)

    if current_user.role == "client" and req.status not in ("confirmed", "rejected"):
        raise ForbiddenException("Customers may only confirm or reject published work")

    valid_statuses = ("pending", "in_progress", "preview_uploaded", "confirmed", "rejected")
    if req.status not in valid_statuses:
        raise ValidationException(detail=f"status must be one of {valid_statuses}")

    if req.status == "confirmed":
        if current_user.role != "client":
            raise ValidationException(detail="Only client can confirm")
        task.status = "confirmed"

        order = db.query(Order).filter(Order.id == task.order_id).first()
        if order and order.status == OrderStatus.RETOUCHING.value:
            all_tasks = db.query(RetouchTask).filter(RetouchTask.order_id == order.id).all()
            if all(t.status == "confirmed" for t in all_tasks):
                old_status = order.status
                new_status = OrderStateMachine.transition(
                    from_status=OrderStatus.RETOUCHING,
                    to_status=OrderStatus.WAITING_CLIENT_CONFIRM,
                    actor_role="photographer",
                )
                order.status = new_status.value
                timeline = OrderTimeline(
                    order_id=order.id,
                    from_status=old_status,
                    to_status=new_status.value,
                    actor_id=current_user.id,
                    action="all_confirmed",
                )
                db.add(timeline)
    elif req.status == "in_progress":
        if current_user.role != "photographer":
            raise ValidationException(detail="Only photographer can start retouch")
        task.status = "in_progress"
    else:
        task.status = req.status

    db.commit()
    db.refresh(task)
    return task


@router.get(
    "/retouch-tasks/{task_id}/feedback",
    response_model=list[RetouchFeedbackResponse],
)
def list_feedback(
    task_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    task = db.get(RetouchTask, task_id)
    if not task:
        raise NotFoundException("RetouchTask")
    order_access(db, task.order_id, current_user)
    return (
        db.query(RetouchFeedback)
        .filter(RetouchFeedback.retouch_task_id == task_id)
        .order_by(RetouchFeedback.created_at)
        .all()
    )


@router.post(
    "/orders/{order_id}/confirm-retouch",
    response_model=RetouchTaskResponse,
)
def confirm_all_retouch(
    order_id: int,
    current_user: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    order = order_access(db, order_id, current_user, lock=True)
    if not db.query(RetouchTask.id).filter_by(order_id=order_id).first():
        raise NotFoundException("RetouchTask")

    if order.status == OrderStatus.RETOUCHING.value:
        old_status = order.status
        new_status = OrderStateMachine.transition(
            from_status=OrderStatus.RETOUCHING,
            to_status=OrderStatus.WAITING_CLIENT_CONFIRM,
            actor_role="photographer",
        )
        order.status = new_status.value
        timeline = OrderTimeline(
            order_id=order.id,
            from_status=old_status,
            to_status=new_status.value,
            actor_id=current_user.id,
            action="upload_preview",
        )
        db.add(timeline)

    if order.status != OrderStatus.WAITING_CLIENT_CONFIRM.value:
        raise ConflictException(
            message="Order must be in RETOUCHING or WAITING_CLIENT_CONFIRM state"
        )

    old_status = order.status
    new_status = OrderStateMachine.transition(
        from_status=OrderStatus.WAITING_CLIENT_CONFIRM,
        to_status=OrderStatus.WAITING_DELIVERY,
        actor_role=current_user.role,
    )
    order.status = new_status.value
    timeline = OrderTimeline(
        order_id=order.id,
        from_status=old_status,
        to_status=new_status.value,
        actor_id=current_user.id,
        action="confirm_retouch",
    )
    db.add(timeline)

    tasks = db.query(RetouchTask).filter(RetouchTask.order_id == order_id).all()
    for task in tasks:
        task.status = "confirmed"

    db.commit()

    first_task = db.query(RetouchTask).filter(RetouchTask.order_id == order_id).first()
    if first_task:
        db.refresh(first_task)
        return first_task
    raise NotFoundException("RetouchTask")
