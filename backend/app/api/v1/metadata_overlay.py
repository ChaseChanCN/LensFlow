"""Photographer-only descriptive editing, bounded indexing and download."""

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.metadata_index import IndexRoute
from app.core.database import get_db
from app.deps import require_role
from app.models.photo import Photo
from app.models.photo_metadata_overlay import PhotoMetadataOverlay as Overlay
from app.models.user import User
from app.schemas.metadata_overlay import (
    BatchItem,
    OverlayBatch,
    OverlayWrite,
    RebuildRequest,
    ResetOverlay,
    RevisionRead,
    inherit_fields,
)
from app.services.keyword_search import keyword_coverage
from app.services.metadata_overlay import load_effective, mutate, rebuild
from app.services.metadata_sidecar import serialize_sidecar
from app.services.photo_access import require_order_access, require_photo_access
from app.services.photo_annotation import authorize_batch


class BoundedMetadataRoute(IndexRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request):
            if request.method in ("PUT", "POST", "DELETE"):
                chunks, size = [], 0
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 128 * 1024:
                        return JSONResponse(
                            {
                                "code": "METADATA_BODY_LIMIT",
                                "message": "元数据请求超过 128 KiB",
                                "detail": "",
                            },
                            status_code=413,
                            headers=PRIVATE,
                        )
                    chunks.append(chunk)
                request._body = b"".join(chunks)
            return await handler(request)

        return bounded


router = APIRouter(tags=["descriptive-metadata"], route_class=BoundedMetadataRoute)
PRIVATE = {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
}


@router.get("/photos/{photo_id}/metadata-effective")
def get_effective(
    photo_id: int,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user, write=True)
    response.headers.update(PRIVATE)
    return load_effective(db, photo, user)


def single_result(result):
    item = result["results"][0]
    if item["status"] == "conflict":
        return JSONResponse(
            dict(
                code="METADATA_CONFLICT",
                message="描述元数据已被其他会话修改",
                current=item["metadata"],
            ),
            status_code=409,
            headers=PRIVATE,
        )
    return JSONResponse(item["metadata"], headers=PRIVATE)


@router.put("/photos/{photo_id}/metadata-overlay")
def put_overlay(
    photo_id: int,
    body: OverlayWrite,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    require_photo_access(db, photo_id, user, write=True)
    return single_result(
        mutate(
            db,
            user,
            [BatchItem(photo_id=photo_id, expected_revision=body.expected_revision)],
            fields=body.fields,
        )
    )


@router.delete("/photos/{photo_id}/metadata-overlay")
def reset_overlay(
    photo_id: int,
    body: ResetOverlay,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    require_photo_access(db, photo_id, user, write=True)
    return single_result(
        mutate(
            db,
            user,
            [BatchItem(photo_id=photo_id, expected_revision=body.expected_revision)],
            fields=inherit_fields(),
        )
    )


@router.post("/photos/metadata-overlays/batch")
def batch(
    body: OverlayBatch,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    response.headers.update(PRIVATE)
    return mutate(db, user, body.items, operation=body.operation)


@router.post("/photos/metadata-overlays/revisions")
def revisions(
    body: RevisionRead,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    authorize_batch(db, body.photo_ids, user)
    rows = dict(
        db.execute(
            select(Overlay.photo_id, Overlay.revision).where(
                Overlay.user_id == user.id, Overlay.photo_id.in_(body.photo_ids)
            )
        ).all()
    )
    response.headers.update(PRIVATE)
    return {"items": [{"photo_id": i, "revision": rows.get(i, 0)} for i in body.photo_ids]}


@router.get("/photos/{photo_id}/metadata-sidecar.xmp")
def sidecar(
    photo_id: int, user: User = Depends(require_role("photographer")), db: Session = Depends(get_db)
):
    photo = require_photo_access(db, photo_id, user, write=True)
    data = serialize_sidecar(load_effective(db, photo, user)["effective"])
    return Response(
        data,
        media_type="application/rdf+xml",
        headers={**PRIVATE, "Content-Disposition": f'attachment; filename="photo-{photo_id}.xmp"'},
    )


@router.get("/orders/{order_id}/metadata-keywords/status")
def status(
    order_id: int,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    require_order_access(db, order_id, user, write=True)
    response.headers.update(PRIVATE)
    return keyword_coverage(db, order_id, user.id)


@router.post("/orders/{order_id}/metadata-keywords/rebuild")
def rebuild_keywords(
    order_id: int,
    body: RebuildRequest,
    response: Response,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    require_order_access(db, order_id, user, write=True)
    photos = db.scalars(
        select(Photo)
        .where(Photo.order_id == order_id, Photo.id > body.after_id)
        .order_by(Photo.id)
        .limit(body.limit + 1)
    ).all()
    more = len(photos) > body.limit
    selected = photos[: body.limit]
    result = rebuild(db, user, selected)
    ids = result["processed"]
    response.headers.update(PRIVATE)
    return dict(
        processed=ids,
        errors=result["errors"],
        has_more=more,
        next_after_id=ids[-1] if more else None,
        coverage=keyword_coverage(db, order_id, user.id),
    )
