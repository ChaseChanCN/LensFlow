"""Photo and Analysis API routes."""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.deps import require_role
from app.models.analysis import AnalysisResult
from app.models.order import Order
from app.models.photo import Photo
from app.models.user import User
from app.schemas.analysis import AnalysisResultResponse, ReviewRequest
from app.schemas.photo import PhotoResponse, PhotoUploadResponse
from app.services.image_analyzer import analyze_image
from app.services.image_editor import decode_jpeg, render_slot
from app.services.order_state import OrderStatus
from app.services.photo_access import require_order_access, require_photo_access
from app.services.storage import get_storage

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg"}

router = APIRouter(tags=["photos"])


def _run_analysis(photo_id: int, storage_key: str):
    """Background task: analyze image and save results."""
    db = SessionLocal()
    try:
        storage = get_storage()
        with storage.open_read(storage_key) as f:
            image_bytes = f.read(settings.image_max_bytes + 1)

        metrics = analyze_image(image_bytes)

        result = AnalysisResult(
            photo_id=photo_id,
            sharpness_score=metrics.sharpness_score,
            brightness_mean=metrics.brightness_mean,
            highlight_ratio=metrics.highlight_ratio,
            shadow_ratio=metrics.shadow_ratio,
            suggestion=metrics.suggestion,
            risk_level=metrics.risk_level,
        )
        db.add(result)
        db.commit()
    except Exception:
        db.rollback()
        result = AnalysisResult(
            photo_id=photo_id,
            suggestion="need_review",
            risk_level="medium",
        )
        db.add(result)
        db.commit()
    finally:
        db.close()


@router.post(
    "/orders/{order_id}/photos",
    response_model=PhotoUploadResponse,
    status_code=201,
)
def upload_photo(
    order_id: int,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    order = require_order_access(db, order_id, current_user, write=True)

    if file.content_type not in ALLOWED_MIME:
        raise ValidationException(detail="Only JPEG images are supported")

    content = file.file.read(min(MAX_FILE_SIZE, settings.image_max_bytes) + 1)
    if len(content) > min(MAX_FILE_SIZE, settings.image_max_bytes):
        raise ValidationException(detail="File size exceeds 20MB limit")
    if len(content) == 0:
        raise ValidationException(detail="Empty file")

    with render_slot(), decode_jpeg(content) as normalized:
        width, height = normalized.size
    storage = get_storage()
    storage_key = storage.save(file.filename or "upload.jpg", content, file.content_type)

    photo = Photo(
        order_id=order_id,
        filename=file.filename or "upload.jpg",
        storage_key=storage_key,
        mime=file.content_type or "image/jpeg",
        size_bytes=len(content),
        width=width,
        height=height,
    )
    db.add(photo)

    analysis_triggered = False
    if order.status == OrderStatus.WAITING_UPLOAD.value:
        order.status = OrderStatus.ANALYZING.value
        analysis_triggered = True

    db.commit()
    db.refresh(photo)

    background_tasks.add_task(_run_analysis, photo.id, storage_key)

    return PhotoUploadResponse(
        photo=PhotoResponse.model_validate(photo),
        analysis_triggered=analysis_triggered,
    )


@router.get("/orders/{order_id}/photos", response_model=list[PhotoResponse])
def list_photos(
    order_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    require_order_access(db, order_id, current_user)
    return db.query(Photo).filter(Photo.order_id == order_id).all()


@router.delete("/orders/{order_id}/photos/{photo_id}")
def delete_photo(
    order_id: int,
    photo_id: int,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, current_user, write=True)
    if photo.order_id != order_id:
        raise NotFoundException("Photo")

    order = db.query(Order).filter(Order.id == order_id).first()
    if order and order.status not in (
        OrderStatus.WAITING_UPLOAD.value,
        OrderStatus.ANALYZING.value,
    ):
        raise ConflictException(message="Cannot delete photo after analysis is complete")

    storage = get_storage()
    storage.delete(photo.storage_key)
    db.query(AnalysisResult).filter(AnalysisResult.photo_id == photo_id).delete()
    db.delete(photo)
    db.commit()
    return {"message": "Photo deleted"}


@router.get("/photos/{photo_id}/analysis", response_model=AnalysisResultResponse)
def get_analysis(
    photo_id: int,
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    require_photo_access(db, photo_id, current_user)
    result = db.query(AnalysisResult).filter(AnalysisResult.photo_id == photo_id).first()
    if not result:
        raise NotFoundException("AnalysisResult")
    return result


@router.patch("/analysis/{analysis_id}/review", response_model=AnalysisResultResponse)
def review_analysis(
    analysis_id: int,
    req: ReviewRequest,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    result = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
    if not result:
        raise NotFoundException("AnalysisResult")

    require_photo_access(db, result.photo_id, current_user, write=True)
    if req.final_decision not in ("exclude", "keep", "pending"):
        raise ValidationException(detail="final_decision must be exclude/keep/pending")

    result.reviewed = True
    result.reviewer_id = current_user.id
    result.reviewed_at = datetime.now(timezone.utc)
    result.final_decision = req.final_decision
    db.commit()
    db.refresh(result)
    return result
