"""Authenticated binary image endpoints. Sync handlers run in FastAPI's thread pool."""

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ValidationException
from app.deps import require_role
from app.models.user import User
from app.schemas.image_edit import ImageEditRequest
from app.services.image_editor import edited_jpeg, preview_jpeg
from app.services.photo_access import require_photo_access


class ImageRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def validated(request: Request):
            allowed = {"max_side"} if request.url.path.endswith("/preview") else set()
            if set(request.query_params) - allowed:
                raise ValidationException("Unknown image request query parameter")
            try:
                return await handler(request)
            except RequestValidationError as exc:
                # Do not serialize raw NaN/Infinity or Pydantic ValueError objects.
                detail = "; ".join(
                    f"{'.'.join(map(str, error['loc']))}: {error['msg']}" for error in exc.errors()
                )
                raise ValidationException(detail) from None

        return validated


router = APIRouter(tags=["photos"], route_class=ImageRoute)


def jpeg_response(content, size, source_hash, photo_id, *, download=False, source_size=None):
    return Response(
        content,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
            "Vary": "Authorization",
            "X-Content-Type-Options": "nosniff",
            "X-Image-Width": str(size[0]),
            "X-Image-Height": str(size[1]),
            "X-Source-SHA256": source_hash,
            "X-Render-Version": "1",
            **(
                {"X-Source-Width": str(source_size[0]), "X-Source-Height": str(source_size[1])}
                if source_size
                else {}
            ),
            "Content-Disposition": (
                f'{"attachment" if download else "inline"}; filename="photo-{photo_id}.jpg"'
            ),
        },
    )


@router.get("/photos/{photo_id}/preview", response_class=Response)
def preview_photo(
    photo_id: int,
    max_side: int = Query(default=1024, ge=1, le=1024),
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, current_user)
    content, size, source_hash, source_size = preview_jpeg(
        photo.storage_key, max_side, include_source_size=True
    )
    return jpeg_response(content, size, source_hash, photo_id, source_size=source_size)


@router.post("/photos/{photo_id}/preview", response_class=Response)
def preview_edited_photo(
    photo_id: int,
    req: ImageEditRequest,
    max_side: int = Query(default=1024, ge=1, le=1024),
    current_user: User = Depends(require_role("photographer", "client")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, current_user)
    return jpeg_response(*edited_jpeg(photo.storage_key, req.edit, max_side=max_side), photo_id)


@router.post("/photos/{photo_id}/export", response_class=Response)
def export_photo(
    photo_id: int,
    req: ImageEditRequest,
    current_user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, current_user, write=True)
    return jpeg_response(*edited_jpeg(photo.storage_key, req.edit), photo_id, download=True)
