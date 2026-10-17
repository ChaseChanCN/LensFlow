"""DB conditional writes; neither process-local locks nor client hashes authorize saves."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException, NotFoundException
from app.models.photo_edit_draft import PhotoEditDraft
from app.schemas.image_edit import EditParameters, parse_edit_parameters
from app.schemas.photo_edit_draft import PhotoEditDraftResponse, SavePhotoEditDraft
from app.services.storage import get_storage


def source_conflict():
    raise AppException(
        "SOURCE_CHANGED", "Original photo has changed; inspect the source photo", status_code=412
    )


def revision_conflict():
    raise AppException(
        "DRAFT_REVISION_CONFLICT", "Draft changed in another session", status_code=409
    )


def source_fingerprint(storage_key: str) -> str:
    digest = hashlib.sha256()
    total = 0
    try:
        with get_storage().open_read(storage_key) as stream:
            while chunk := stream.read(256 * 1024):
                total += len(chunk)
                if total > settings.image_max_bytes:
                    raise AppException(
                        "IMAGE_TOO_LARGE", "Source exceeds byte limit", status_code=413
                    )
                digest.update(chunk)
    except FileNotFoundError:
        raise NotFoundException("Photo file") from None
    except (OSError, ImportError):
        raise AppException(
            "STORAGE_UNAVAILABLE", "Photo storage unavailable", status_code=503
        ) from None
    return digest.hexdigest()


def draft_query(photo_id: int, user_id: int):
    return select(PhotoEditDraft).where(
        PhotoEditDraft.photo_id == photo_id, PhotoEditDraft.user_id == user_id
    )


def load_draft(db: Session, photo_id: int, user_id: int, source_hash: str):
    draft = db.scalar(draft_query(photo_id, user_id))
    if draft and draft.source_sha256 != source_hash:
        source_conflict()
    return PhotoEditDraftResponse(
        photo_id=photo_id,
        exists=draft is not None,
        parameters=parse_edit_parameters(draft.parameters_json) if draft else EditParameters(),
        revision=draft.revision if draft else 0,
        source_sha256=source_hash,
        updated_at=draft.updated_at if draft else None,
    )


def save_draft(db: Session, photo_id: int, user_id: int, source_hash: str, req: SavePhotoEditDraft):
    if req.expected_source_sha256 != source_hash:
        source_conflict()
    draft = db.scalar(draft_query(photo_id, user_id))
    if draft and draft.source_sha256 != source_hash:
        source_conflict()
    now = datetime.now(timezone.utc)
    parameters = req.parameters.model_dump()
    try:
        if draft is None:
            if req.expected_revision != 0:
                revision_conflict()
            db.add(
                PhotoEditDraft(
                    photo_id=photo_id,
                    user_id=user_id,
                    parameters_json=parameters,
                    source_sha256=source_hash,
                    revision=1,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            result = db.execute(
                update(PhotoEditDraft)
                .where(
                    PhotoEditDraft.photo_id == photo_id,
                    PhotoEditDraft.user_id == user_id,
                    PhotoEditDraft.revision == req.expected_revision,
                    PhotoEditDraft.source_sha256 == source_hash,
                )
                .values(
                    parameters_json=parameters, revision=PhotoEditDraft.revision + 1, updated_at=now
                )
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                db.rollback()
                revision_conflict()
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(draft_query(photo_id, user_id)) is not None:
            revision_conflict()
        raise AppException(
            "DRAFT_WRITE_FAILED", "Draft could not be saved", status_code=503
        ) from None
    except OperationalError:
        db.rollback()
        raise AppException(
            "DRAFT_BUSY", "Database temporarily unavailable; retry explicitly", status_code=503
        ) from None
    return PhotoEditDraftResponse(
        photo_id=photo_id,
        exists=True,
        parameters=req.parameters,
        revision=req.expected_revision + 1,
        source_sha256=source_hash,
        updated_at=now,
    )
