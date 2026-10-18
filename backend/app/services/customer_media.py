"""Private finite media grants: header-only, exact scope, current-access recheck."""

import hashlib
import time
from collections import OrderedDict
from contextlib import contextmanager
from datetime import datetime, timezone
from threading import BoundedSemaphore, Lock
from urllib.parse import quote

from fastapi.responses import Response, StreamingResponse
from jose import JWTError, jwt
from PIL import Image
from starlette.background import BackgroundTask

from app.core.config import settings
from app.core.exceptions import (
    AppException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)
from app.models.delivery import Delivery
from app.models.photo import Photo
from app.models.selection import SelectionItem
from app.models.user import User
from app.schemas.customer import MediaGrantRequest, MediaGrantResponse
from app.services.customer_workflow import order_access, selection_for_order
from app.services.image_editor import encode_jpeg, normalized_source, render_slot
from app.services.storage import get_storage
from app.services.thumbnails import thumbnail

HEADERS = {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
}
DELIVERY_STATES = {"DELIVERED", "ARCHIVED"}
MAX_DELIVERY_BYTES = 100 * 1024 * 1024
GRANT_TTL = 120
_slots = BoundedSemaphore(4)
_rate_lock = Lock()
_rate = OrderedDict()


def admission(user_id):
    # Admission only, never authorization/idempotency. Per-worker, bounded 4096 buckets.
    now = time.monotonic()
    with _rate_lock:
        start, count = _rate.pop(user_id, (now, 0))
        if now - start >= 60:
            start, count = now, 0
        _rate[user_id] = (start, count + 1)
        while len(_rate) > 4096:
            _rate.popitem(last=False)
        if count >= 60:
            raise AppException("MEDIA_RATE_LIMIT", "Media grant rate exceeded", status_code=429)


def published_photo(db, user, photo_id):
    photo = db.get(Photo, photo_id)
    if not photo:
        raise NotFoundException("Photo")
    order = order_access(db, photo.order_id, user)
    if order.status == "CANCELLED":
        raise ForbiddenException("Order access revoked")
    selection = selection_for_order(db, order, user)
    if (
        not db.query(SelectionItem.id)
        .filter_by(selection_set_id=selection.id, photo_id=photo.id)
        .first()
    ):
        raise NotFoundException("Published photo")
    if photo.mime != "image/jpeg":
        raise AppException("UNSUPPORTED_IMAGE", "Only JPEG previews are available", status_code=415)
    return photo


def published_delivery(db, user, delivery_id):
    delivery = db.get(Delivery, delivery_id)
    if not delivery:
        raise NotFoundException("Delivery")
    order = order_access(db, delivery.order_id, user)
    if order.status not in DELIVERY_STATES:
        raise NotFoundException("Published delivery")
    return delivery


@contextmanager
def source_stream(key):
    try:
        with get_storage().open_read(key) as stream:
            yield stream
    except FileNotFoundError:
        raise NotFoundException("Media file") from None
    except (OSError, ImportError):
        raise AppException(
            "STORAGE_UNAVAILABLE", "Media storage unavailable", status_code=503
        ) from None


def delivery_info(delivery):
    with source_stream(delivery.storage_key) as stream:
        magic = stream.read(12)
        stream.seek(0, 2)
        length = stream.tell()
    if length > MAX_DELIVERY_BYTES:
        raise AppException("MEDIA_TOO_LARGE", "Delivery exceeds limit", status_code=413)
    mime = (
        "image/jpeg"
        if magic.startswith(b"\xff\xd8\xff")
        else "image/png"
        if magic.startswith(b"\x89PNG\r\n\x1a\n")
        else "application/zip"
        if magic.startswith(b"PK\x03\x04")
        else None
    )
    return mime, length


def issue_grant(db, user, request):
    admission(user.id)
    asset = (
        published_photo(db, user, request.media_id)
        if request.kind == "photo"
        else published_delivery(db, user, request.media_id)
    )
    if request.kind == "delivery":
        mime, _ = delivery_info(asset)
        if mime is None or (request.variant == "preview" and mime != "image/jpeg"):
            raise AppException(
                "UNSUPPORTED_MEDIA", "This delivery has no supported media variant", status_code=415
            )
    now = int(time.time())
    claims = {
        "aud": "customer-media",
        "sub": str(user.id),
        "iat": now,
        "exp": now + GRANT_TTL,
        "order": asset.order_id,
        "scope": request.model_dump(),
        "source": hashlib.sha256(asset.storage_key.encode()).hexdigest(),
    }
    token = jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256")
    return MediaGrantResponse(
        token=token, expires_at=datetime.fromtimestamp(now + GRANT_TTL, timezone.utc)
    )


def redeem_grant(db, token):
    if len(token) > 2048:
        raise UnauthorizedException("Invalid media grant")
    try:
        claims = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"], audience="customer-media"
        )
        user_id = int(claims["sub"])
        scope = MediaGrantRequest.model_validate(claims["scope"])
        if int(claims["exp"]) - int(claims["iat"]) != GRANT_TTL:
            raise ValueError
    except (JWTError, ValueError, KeyError, TypeError):
        raise UnauthorizedException("Expired or invalid media grant") from None
    user = db.get(User, user_id)
    if not user or not user.is_active or user.role != "client":
        raise UnauthorizedException("Customer session unavailable")
    asset = (
        published_photo(db, user, scope.media_id)
        if scope.kind == "photo"
        else published_delivery(db, user, scope.media_id)
    )
    if asset.order_id != claims.get("order") or hashlib.sha256(
        asset.storage_key.encode()
    ).hexdigest() != claims.get("source"):
        raise ForbiddenException("Media identity changed")
    if scope.variant == "download":
        mime, _ = delivery_info(asset)
        if mime is None:
            raise AppException("UNSUPPORTED_MEDIA", "Invalid delivery format", status_code=415)
        return stream_delivery(asset, mime)
    if not _slots.acquire(False):
        raise AppException("MEDIA_BUSY", "Media workers busy", status_code=429)
    try:
        if scope.variant == "thumbnail":
            content, _ = thumbnail(asset.storage_key, scope.size)
        else:
            with render_slot(), normalized_source(asset.storage_key) as (image, _):
                image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                content = encode_jpeg(image)
        return Response(content, media_type="image/jpeg", headers=HEADERS)
    finally:
        _slots.release()


def stream_delivery(asset, mime="application/octet-stream"):
    if not _slots.acquire(False):
        raise AppException("MEDIA_BUSY", "Media workers busy", status_code=429)
    context = source_stream(asset.storage_key)
    try:
        stream = context.__enter__()
        stream.seek(0, 2)
        length = stream.tell()
        stream.seek(0)
        if length > MAX_DELIVERY_BYTES:
            raise AppException("MEDIA_TOO_LARGE", "Delivery exceeds limit", status_code=413)
    except BaseException:
        context.__exit__(None, None, None)
        _slots.release()
        raise

    cleanup_lock = Lock()
    closed = False

    def close():
        nonlocal closed
        with cleanup_lock:
            if not closed:
                closed = True
                try:
                    context.__exit__(None, None, None)
                finally:
                    _slots.release()

    def chunks():
        try:
            while content := stream.read(64 * 1024):
                yield content
        finally:
            close()

    return StreamingResponse(
        chunks(),
        media_type=mime,
        background=BackgroundTask(close),
        headers={
            **HEADERS,
            "Content-Length": str(length),
            "Content-Disposition": "attachment; filename*=UTF-8''" + quote(asset.filename, safe=""),
        },
    )
