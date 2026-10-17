"""Photographer-only, client-driven metadata work units and SQL metadata navigation."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.v1.photo_metadata import MetadataRoute
from app.core.database import get_db
from app.core.exceptions import ValidationException
from app.deps import require_role
from app.models.user import User
from app.schemas.catalog_filters import normalize_filters
from app.schemas.metadata_filters import METADATA_KEYS, normalize_metadata_filters
from app.schemas.metadata_index import (
    IndexBatchRequest,
    IndexBatchResponse,
    IndexCounts,
    IndexRequest,
    IndexResult,
    IndexIssues,
    MetadataFacets,
    MetadataTimeline,
)
from app.services.metadata_index import index_batch, index_counts, index_photo
from app.services.metadata_search import facets, timeline
from app.services.metadata_issues import list_issues
from app.services.photo_access import require_order_access, require_photo_access

router = APIRouter(tags=["metadata-index"], route_class=MetadataRoute)
owner = Depends(require_role("photographer"))


def known_query(request, allowed=frozenset()):
    if set(request.query_params) - allowed or any(
        len(request.query_params.getlist(k)) != 1 for k in request.query_params
    ):
        raise ValidationException("Unknown or repeated metadata query parameter")


@router.post("/photos/{photo_id}/metadata-index", response_model=IndexResult)
def refresh_photo(
    photo_id: int,
    req: IndexRequest,
    request: Request,
    user: User = owner,
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user, write=True)
    known_query(request)
    return index_photo(db, photo.id, photo.storage_key)


@router.post("/orders/{order_id}/metadata-index", response_model=IndexBatchResponse)
def refresh_order(
    order_id: int,
    req: IndexBatchRequest,
    request: Request,
    user: User = owner,
    db: Session = Depends(get_db),
):
    require_order_access(db, order_id, user, write=True)
    known_query(request)
    return index_batch(db, order_id, user.id, req)


@router.get("/orders/{order_id}/metadata-index/status", response_model=IndexCounts)
def status(order_id: int, request: Request, user: User = owner, db: Session = Depends(get_db)):
    require_order_access(db, order_id, user, write=True)
    known_query(request)
    return index_counts(db, order_id)


@router.get("/orders/{order_id}/metadata-index/issues", response_model=IndexIssues)
def issues(
    order_id: int, request: Request,
    status: str = Query("failed,unsupported,warnings", max_length=40),
    limit: int = Query(20, ge=1, le=50),
    cursor: str | None = Query(None, min_length=1, max_length=320),
    user: User = owner, db: Session = Depends(get_db),
):
    require_order_access(db, order_id, user, write=True)
    known_query(request, {"status", "limit", "cursor"})
    return list_issues(db, order_id, user.id, status, limit, cursor)


@router.get("/orders/{order_id}/photos/metadata-facets", response_model=MetadataFacets)
def device_facets(
    order_id: int, request: Request, user: User = owner, db: Session = Depends(get_db)
):
    require_order_access(db, order_id, user, write=True)
    known_query(request)
    return facets(db, order_id)


@router.get("/orders/{order_id}/photos/timeline", response_model=MetadataTimeline)
def capture_timeline(
    order_id: int,
    request: Request,
    level: Literal["year", "month", "day"] = "year",
    year: int | None = Query(None, ge=1, le=9999),
    month: int | None = Query(None, ge=1, le=12),
    rating: int | None = Query(None, ge=0, le=5),
    rating_min: int | None = Query(None, ge=0, le=5),
    colors: str | None = Query(None, max_length=48),
    pick: str | None = Query(None, max_length=32),
    sort: str = Query("id_asc", max_length=16),
    user: User = owner,
    db: Session = Depends(get_db),
):
    require_order_access(db, order_id, user, write=True)
    known_query(
        request,
        {"level", "year", "month", "rating", "rating_min", "colors", "pick", "sort"}
        | METADATA_KEYS,
    )
    if (
        (level == "year" and (year is not None or month is not None))
        or (level == "month" and (year is None or month is not None))
        or (level == "day" and (year is None or month is None))
    ):
        raise ValidationException("Timeline level requires year/month parent scope")
    filters = normalize_filters(
        rating, rating_min, colors, pick, sort, normalize_metadata_filters(request.query_params)
    )
    return timeline(db, order_id, user.id, filters, level, year, month)
