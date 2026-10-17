from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import NotFoundException, ValidationException
from app.deps import require_role
from app.models.user import User
from app.schemas.photo_catalog import PhotoAssetResponse, PhotoCatalogResponse
from app.services.photo_access import require_order_access, require_photo_access
from app.services.photo_catalog import catalog_page
from app.services.thumbnails import thumbnail
from app.schemas.catalog_filters import normalize_filters
from app.schemas.metadata_filters import METADATA_KEYS, normalize_metadata_filters
from app.core.exceptions import ForbiddenException

router = APIRouter(tags=["photos"])


def known_query(request, allowed):
    if set(request.query_params) - allowed:
        raise ValidationException("Unknown catalog/thumbnail query parameter")


@router.get("/photos/{photo_id}/thumbnail")
def get_thumbnail(
    photo_id: int,
    request: Request,
    size: int = Query(256),
    user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    known_query(request, {"size"})
    if size not in (128, 256, 512):
        raise ValidationException("Unsupported thumbnail size")
    photo = require_photo_access(db, photo_id, user)
    content, status = thumbnail(photo.storage_key, size)
    return Response(
        content,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
            "Vary": "Authorization",
            "X-Content-Type-Options": "nosniff",
            "X-Thumbnail-Cache": status,
        },
    )


@router.get("/orders/{order_id}/photos/catalog", response_model=PhotoCatalogResponse)
def get_catalog(
    order_id: int,
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None, min_length=1, max_length=512),
    rating: int | None = Query(None, ge=0, le=5),
    rating_min: int | None = Query(None, ge=0, le=5),
    colors: str | None = Query(None, max_length=48),
    pick: str | None = Query(None, max_length=32),
    sort: str = Query('id_asc', max_length=16),
    user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    known_query(request, {"limit", "cursor", "rating", "rating_min", "colors", "pick", "sort"} | METADATA_KEYS)
    if any(len(request.query_params.getlist(key)) != 1 for key in request.query_params):
        raise ValidationException('Repeated query parameters are not supported')
    require_order_access(db, order_id, user)
    filters = normalize_filters(rating, rating_min, colors, pick, sort, normalize_metadata_filters(request.query_params))
    if user.role != 'photographer' and filters.private:
        raise ForbiddenException('Photographer annotation filters are private')
    response.headers["Cache-Control"] = "private, no-store"
    return catalog_page(db, order_id, user.id, limit, cursor, private_annotations=user.role == 'photographer', filters=filters)


@router.get("/orders/{order_id}/photos/{photo_id}/asset", response_model=PhotoAssetResponse)
def get_asset(
    order_id: int,
    photo_id: int,
    response: Response,
    user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user)
    if photo.order_id != order_id:
        raise NotFoundException("Photo")
    response.headers["Cache-Control"] = "private, no-store"
    asset = PhotoAssetResponse.model_validate(photo)
    if user.role == 'photographer':
        from app.services.photo_annotation import load_annotation
        asset.annotation = load_annotation(db, photo.id, user.id)
    return asset
