from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.exceptions import AppException
from app.deps import require_role
from app.models.user import User
from app.schemas.photo_annotation import AnnotationResponse, SaveAnnotation, BatchAnnotations, BatchItem, BatchResponse
from app.services.photo_access import require_photo_access
from app.services.photo_annotation import load_annotation, write_annotations

router = APIRouter(tags=['photo-annotations'])


@router.get('/photos/{photo_id}/annotation', response_model=AnnotationResponse)
def get_annotation(photo_id: int, response: Response, user: User = Depends(require_role('photographer')), db: Session = Depends(get_db)):
    require_photo_access(db, photo_id, user, write=True)
    response.headers['Cache-Control'] = 'private, no-store'
    return load_annotation(db, photo_id, user.id)


@router.put('/photos/{photo_id}/annotation', response_model=AnnotationResponse)
def put_annotation(photo_id: int, request: SaveAnnotation, response: Response, user: User = Depends(require_role('photographer')), db: Session = Depends(get_db)):
    require_photo_access(db, photo_id, user, write=True)
    result = write_annotations(db, user, [BatchItem(photo_id=photo_id, expected_revision=request.expected_revision)], request.model_dump(exclude={'expected_revision'}))
    if result.conflicted:
        raise AppException('ANNOTATION_REVISION_CONFLICT', 'Metadata changed; read current annotation before retrying', status_code=409)
    response.headers['Cache-Control'] = 'private, no-store'
    return result.results[0].annotation


@router.post('/photos/annotations/batch', response_model=BatchResponse)
def batch_annotations(request: BatchAnnotations, response: Response, user: User = Depends(require_role('photographer')), db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'private, no-store'
    return write_annotations(db, user, request.items, request.changes.model_dump(exclude_unset=True))
