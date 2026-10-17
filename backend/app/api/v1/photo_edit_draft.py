from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.v1.image_edit import ImageRoute
from app.core.database import get_db
from app.deps import require_role
from app.models.user import User
from app.schemas.photo_edit_draft import PhotoEditDraftResponse, SavePhotoEditDraft
from app.services.photo_access import require_photo_access
from app.services.photo_edit_draft import load_draft, save_draft, source_fingerprint

router = APIRouter(tags=["photos"], route_class=ImageRoute)


@router.get("/photos/{photo_id}/edit-draft", response_model=PhotoEditDraftResponse)
def get_edit_draft(
    photo_id: int,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return load_draft(db, photo.id, user.id, source_fingerprint(photo.storage_key))


@router.put("/photos/{photo_id}/edit-draft", response_model=PhotoEditDraftResponse)
def put_edit_draft(
    photo_id: int,
    req: SavePhotoEditDraft,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return save_draft(db, photo.id, user.id, source_fingerprint(photo.storage_key), req)
