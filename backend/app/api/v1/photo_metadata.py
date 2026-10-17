"""Photographer-owned, source-bound metadata. Sync parsing stays off the event loop."""

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException

from app.core.database import get_db
from app.core.exceptions import AppException, ValidationException, app_exception_handler
from app.deps import require_role
from app.models.user import User
from app.schemas.photo_metadata import PhotoMetadataResponse
from app.services.photo_access import require_photo_access
from app.services.photo_metadata import read_photo_metadata

PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
}


class MetadataRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def private(request):
            # Use existing handlers also for auth/validation failures, with private headers.
            try:
                response = await handler(request)
            except AppException as exc:
                response = await app_exception_handler(request, exc)
            except RequestValidationError:
                response = JSONResponse(
                    {"code": "VALIDATION_ERROR", "message": "Invalid photo ID", "detail": ""},
                    status_code=422,
                )
            except HTTPException as exc:
                response = JSONResponse(
                    {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
                )
            except Exception:
                # Never put raw private file metadata in debug exception responses.
                response = JSONResponse(
                    {"code": "METADATA_ERROR", "message": "Metadata unavailable", "detail": ""},
                    status_code=500,
                )
            response.headers.update(PRIVATE_HEADERS)
            return response

        return private


router = APIRouter(tags=["photos"], route_class=MetadataRoute)


@router.get("/photos/{photo_id}/metadata", response_model=PhotoMetadataResponse)
def get_metadata(
    photo_id: int,
    request: Request,
    user: User = Depends(require_role("photographer")),
    db: Session = Depends(get_db),
):
    photo = require_photo_access(db, photo_id, user, write=True)
    if request.query_params:
        raise ValidationException("Metadata endpoint does not accept query parameters")
    return read_photo_metadata(photo.id, photo.storage_key)
