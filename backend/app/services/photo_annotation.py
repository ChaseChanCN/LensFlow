"""Database CAS; a batch is one transaction with recoverable per-item revision conflicts."""
from datetime import datetime, timezone
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from app.core.exceptions import AppException, ForbiddenException
from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
from app.models.photo import Photo
from app.models.order import Order
from app.schemas.photo_annotation import AnnotationResponse, BatchResponse, BatchResult


def annotation_query(photo_id, user_id):
    return select(Annotation).where(Annotation.photo_id == photo_id, Annotation.user_id == user_id)


def load_annotation(db, photo_id, user_id):
    row = db.scalar(annotation_query(photo_id, user_id).execution_options(populate_existing=True))
    return AnnotationResponse.model_validate(row).model_copy(update={'exists': True}) if row else AnnotationResponse(photo_id=photo_id)


def authorize_batch(db, ids, user):
    # One joined query, including missing IDs; do not reveal inaccessible item identities.
    allowed = set(db.scalars(select(Photo.id).join(Order, Photo.order_id == Order.id).where(Photo.id.in_(ids), Order.photographer_id == user.id)))
    if user.role != 'photographer' or allowed != set(ids):
        raise ForbiddenException('Batch contains inaccessible photos')


def apply_item(db, photo_id, user_id, expected, changes):
    now = datetime.now(timezone.utc)
    result = db.execute(update(Annotation).where(Annotation.photo_id == photo_id, Annotation.user_id == user_id, Annotation.revision == expected).values(**changes, revision=Annotation.revision + 1, updated_at=now).execution_options(synchronize_session=False))
    if result.rowcount == 1:
        return True
    if expected != 0:
        return False
    try:
        # Unique key resolves competing first creates, not a process-local lock.
        with db.begin_nested():
            db.add(Annotation(photo_id=photo_id, user_id=user_id, rating=changes.get('rating', 0), color_label=changes.get('color_label'), pick_status=changes.get('pick_status', 'unmarked'), revision=1, created_at=now, updated_at=now))
            db.flush()
        return True
    except IntegrityError:
        if db.scalar(annotation_query(photo_id, user_id)) is not None:
            return False
        raise


def write_annotations(db, user, items, changes):
    authorize_batch(db, [i.photo_id for i in items], user)
    try:
        statuses = []
        for item in items:
            success = apply_item(db, item.photo_id, user.id, item.expected_revision, changes)
            statuses.append((item.photo_id, success))
        current = {row.photo_id: row for row in db.scalars(select(Annotation).where(Annotation.user_id == user.id, Annotation.photo_id.in_([i.photo_id for i in items])).execution_options(populate_existing=True))}
        results = [BatchResult(photo_id=photo_id, status='success' if success else 'conflict', annotation=AnnotationResponse.model_validate(current[photo_id]).model_copy(update={'exists': True}) if photo_id in current else AnnotationResponse(photo_id=photo_id)) for photo_id, success in statuses]
        db.commit()
        return BatchResponse(results=results, succeeded=sum(r.status == 'success' for r in results), conflicted=sum(r.status == 'conflict' for r in results))
    except SQLAlchemyError:
        db.rollback()
        raise AppException('ANNOTATION_WRITE_FAILED', 'Metadata transaction rolled back; refresh before retrying', status_code=503) from None
    except Exception:
        db.rollback()
        raise
