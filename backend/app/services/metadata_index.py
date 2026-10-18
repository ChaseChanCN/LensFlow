"""Bounded synchronous work units with durable per-photo CAS leases.

No autonomous worker: pending work resumes only on another authorized request.
Catalog queries never read original files. External source replacement requires refresh.
"""

import base64
import hashlib
import hmac
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.exc import DBAPIError, IntegrityError, TimeoutError

from app.core.config import settings
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.core.logging import logger
from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.schemas.metadata_filters import device_value
from app.schemas.metadata_index import IndexBatchResponse, IndexCounts, IndexResult
from app.services.photo_metadata import metadata_slot, normalize_metadata
from app.services.storage import get_storage

PARSER_VERSION = "c1-v1.index-v1"
LEASE_SECONDS = 120
BATCH_SECONDS = 1.5  # Checked between files, not a hard filesystem I/O deadline.
VALUE_FIELDS = (
    "camera_make",
    "camera_model",
    "lens_make",
    "lens_model",
    "iso",
    "focal_length_mm",
    "f_number",
    "exposure_seconds",
    "capture_datetime_local",
    "capture_timezone_offset_minutes",
    "capture_date",
    "capture_timezone_known",
    "warning_count",
)


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def database_failure(db, exc):
    """Classify PostgreSQL SQLSTATE without returning driver messages or bind values."""
    db.rollback()
    state = getattr(getattr(exc, "orig", None), "pgcode", None)
    state = state or getattr(getattr(exc, "orig", None), "sqlstate", None)
    original_message = str(getattr(exc, "orig", "")).lower()
    fallback = (
        "INDEX_DATABASE_BUSY"
        if isinstance(exc, TimeoutError)
        or "locked" in original_message
        or "database is busy" in original_message
        else "INDEX_DATABASE_ERROR"
    )
    code = {
        "42P01": "SCHEMA_NOT_READY",
        "40P01": "INDEX_DATABASE_DEADLOCK",
        "40001": "INDEX_DATABASE_RETRY",
        "55P03": "INDEX_DATABASE_BUSY",
        "57014": "INDEX_DATABASE_BUSY",
    }.get(state, fallback if state is None else "INDEX_DATABASE_ERROR")
    if state is None and "no such table:" in original_message:
        code = "SCHEMA_NOT_READY"
    logger.warning("Metadata index transaction failed: %s", code)
    message = (
        "Review and apply Alembic migrations before using DAM metadata"
        if code == "SCHEMA_NOT_READY"
        else "Metadata index transaction failed; refresh before retrying"
    )
    raise AppException(code, message, status_code=503) from None


def current_index():
    return and_(Index.status == "indexed", Index.parser_version == PARSER_VERSION)


def index_counts(db, order_id):
    row = (
        db.execute(
            select(
                func.count(Photo.id).label("total"),
                func.count(Index.id).label("rows"),
                func.sum(case((current_index(), 1), else_=0)).label("indexed"),
                *[
                    func.sum(
                        case(
                            (
                                and_(Index.status == state, Index.parser_version == PARSER_VERSION),
                                1,
                            ),
                            else_=0,
                        )
                    ).label(state)
                    for state in ("failed", "unsupported")
                ],
                func.sum(case((Index.lease_expires_at > utcnow(), 1), else_=0)).label("active"),
                func.coalesce(func.sum(Index.revision), 0).label("revisions"),
                func.max(Index.updated_at).label("latest"),
            )
            .select_from(Photo)
            .outerjoin(Index, Index.photo_id == Photo.id)
            .where(Photo.order_id == order_id)
        )
        .mappings()
        .one()
    )
    total, indexed, failed, unsupported = [
        row[k] or 0 for k in ("total", "indexed", "failed", "unsupported")
    ]
    return IndexCounts(
        total=total,
        indexed=indexed,
        pending=total - indexed - failed - unsupported,
        failed=failed,
        unsupported=unsupported,
        unindexed=total - row["rows"],
        active=row["active"] or 0,
        generation=f"{PARSER_VERSION}:{total}:{row['rows']}:{row['revisions']}:{row['latest']}",
        parser_version=PARSER_VERSION,
    )


def result(db, photo_id, *, reused=False, busy=False):
    row = db.scalar(
        select(Index).where(Index.photo_id == photo_id).execution_options(populate_existing=True)
    )
    if row is None:
        raise NotFoundException("Photo metadata index")
    return IndexResult(
        **{
            key: getattr(row, key)
            for key in IndexResult.model_fields
            if key not in ("reused", "busy")
        },
        reused=reused,
        busy=busy,
    )


def claim(db, photo_id):
    try:
        return _claim(db, photo_id)
    except (DBAPIError, TimeoutError) as exc:
        database_failure(db, exc)


def _claim(db, photo_id):
    now, token = utcnow(), uuid4().hex
    row = db.scalar(select(Index).where(Index.photo_id == photo_id))
    if row is None:
        try:
            with db.begin_nested():
                db.add(Index(photo_id=photo_id, parser_version=PARSER_VERSION, status="pending"))
                db.flush()
        except IntegrityError:
            pass
        db.expire_all()
        row = db.scalar(select(Index).where(Index.photo_id == photo_id))
    if row is None:
        raise NotFoundException("Photo")
    previous = {
        key: getattr(row, key)
        for key in (*VALUE_FIELDS, "source_sha256", "parser_version", "status", "indexed_at")
    }
    try:
        changed = db.execute(
            update(Index)
            .where(
                Index.photo_id == photo_id,
                Index.revision == row.revision,
                or_(Index.lease_expires_at.is_(None), Index.lease_expires_at <= now),
            )
            .values(
                status="pending",
                lease_token=token,
                lease_expires_at=now + timedelta(seconds=LEASE_SECONDS),
                parser_version=PARSER_VERSION,
                source_sha256=None,
                indexed_at=None,
                error_code=None,
                revision=Index.revision + 1,
                updated_at=now,
                **{
                    key: False
                    if key == "capture_timezone_known"
                    else 0
                    if key == "warning_count"
                    else None
                    for key in VALUE_FIELDS
                },
            )
            .execution_options(synchronize_session=False)
        ).rowcount
        if changed:
            previous["_lease_revision"] = row.revision + 1
        db.commit()
        return (token, previous) if changed else (None, None)
    except (DBAPIError, TimeoutError) as exc:
        database_failure(db, exc)


def source_bytes(storage_key):
    if settings.storage_type != "local":
        raise AppException(
            "UNSUPPORTED_STORAGE", "Binary indexing unavailable for this storage", status_code=503
        )
    try:
        with get_storage().open_read(storage_key) as stream:
            content = stream.read(settings.image_max_bytes + 1)
    except FileNotFoundError:
        raise NotFoundException("Photo file") from None
    except (OSError, ImportError):
        raise AppException(
            "STORAGE_UNAVAILABLE", "Photo storage unavailable", status_code=503
        ) from None
    if len(content) > settings.image_max_bytes:
        raise AppException("IMAGE_TOO_LARGE", "Source exceeds byte limit", status_code=413)
    return content


def index_values(metadata):
    values = {"warning_count": len(metadata.warnings)}
    for key in ("camera_make", "camera_model", "lens_make", "lens_model"):
        raw = getattr(metadata.camera, key.replace("camera_", ""))
        try:
            values[key] = device_value(raw)
        except ValidationException:
            # Oversized/invalid device text cannot become an exact-match facet.
            values[key] = None
            values["warning_count"] += 1
    for key in ("iso", "focal_length_mm", "f_number", "exposure_seconds"):
        values[key] = getattr(metadata.capture, key)
    timestamp = metadata.capture.date_time_original
    local, offset = timestamp, None
    if timestamp:
        match = re.search(r"(Z|([+-])(\d{2}):(\d{2}))$", timestamp)
        if match:
            local = timestamp[: match.start()]
            offset = (
                0
                if match[1] == "Z"
                else (int(match[3]) * 60 + int(match[4])) * (-1 if match[2] == "-" else 1)
            )
    values.update(
        capture_datetime_local=local,
        capture_date=date.fromisoformat(local[:10]) if local else None,
        capture_timezone_offset_minutes=offset,
        capture_timezone_known=offset is not None,
    )
    return values


def index_photo(db, photo_id, storage_key):
    token, previous = claim(db, photo_id)
    if token is None:
        return result(db, photo_id, busy=True)
    digest, reused = None, False
    try:
        with metadata_slot():
            content = source_bytes(storage_key)
            digest = hashlib.sha256(content).hexdigest()
            if (
                previous["status"] == "indexed"
                and previous["source_sha256"] == digest
                and previous["parser_version"] == PARSER_VERSION
            ):
                values = {key: previous[key] for key in VALUE_FIELDS}
                indexed_at, reused = previous["indexed_at"], True
            else:
                if not content.startswith(b"\xff\xd8"):
                    raise AppException(
                        "UNSUPPORTED_FORMAT",
                        "Only JPEG metadata indexing is supported",
                        status_code=415,
                    )
                metadata = normalize_metadata(photo_id, content)
                values, indexed_at = index_values(metadata), utcnow()
        values.update(
            status="indexed",
            indexed_at=indexed_at,
            error_code="METADATA_WARNINGS" if values["warning_count"] else None,
        )
    except AppException as exc:
        if exc.code == "METADATA_BUSY":
            values = {"status": "pending", "error_code": "METADATA_BUSY"}
        else:
            values = {
                "status": "unsupported"
                if exc.status_code == 415 or exc.code == "UNSUPPORTED_STORAGE"
                else "failed",
                "error_code": exc.code
                if exc.code
                in (
                    "UNSUPPORTED_FORMAT",
                    "UNSUPPORTED_STORAGE",
                    "UNSUPPORTED_JPEG",
                    "UNSUPPORTED_COLOR_SPACE",
                    "INVALID_JPEG",
                    "IMAGE_TOO_LARGE",
                    "METADATA_TOO_LARGE",
                    "NOT_FOUND",
                    "STORAGE_UNAVAILABLE",
                    "VALIDATION_ERROR",
                )
                else "EXTRACTION_FAILED",
            }
    except Exception:
        values = {"status": "failed", "error_code": "EXTRACTION_FAILED"}
    # Never overwrite a newer lease. Parsing happens outside a transaction.
    try:
        published = db.execute(
            update(Index)
            .where(
                Index.photo_id == photo_id,
                Index.lease_token == token,
                Index.revision == previous["_lease_revision"],
                Index.status == "pending",
                Index.parser_version == PARSER_VERSION,
                Index.lease_expires_at > utcnow(),
            )
            .values(
                **values,
                source_sha256=digest,
                parser_version=PARSER_VERSION,
                lease_token=None,
                lease_expires_at=None,
                revision=Index.revision + 1,
                updated_at=utcnow(),
            )
            .execution_options(synchronize_session=False)
        ).rowcount
        db.commit()
    except (DBAPIError, TimeoutError) as exc:
        # The committed lease remains recoverable after expiry. Never report an
        # extraction as indexed until its publication transaction has committed.
        database_failure(db, exc)
    return result(db, photo_id, reused=reused if published else False, busy=not bool(published))


def batch_cursor(values):
    payload = json.dumps(values, separators=(",", ":")).encode()
    signature = hmac.new(
        settings.jwt_secret_key.encode(), b"metadata-index:" + payload, hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(payload + signature).decode().rstrip("=")


def batch_scope(cursor, order_id, user_id, mode):
    try:
        packed = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        payload, signature = packed[:-32], packed[-32:]
        if not hmac.compare_digest(
            signature,
            hmac.new(
                settings.jwt_secret_key.encode(), b"metadata-index:" + payload, hashlib.sha256
            ).digest(),
        ):
            raise ValueError
        v, order, user, intent, after, ceiling = json.loads(payload)
        if (
            (v, order, user, intent) != (1, order_id, user_id, mode)
            or any(type(n) is not int for n in (v, order, user, after, ceiling))
            or not 0 < after <= ceiling <= 2**63 - 1
        ):
            raise ValueError
        return after, ceiling
    except (ValueError, TypeError, UnicodeError):
        raise ValidationException("Invalid metadata batch cursor") from None


def index_batch(db, order_id, user_id, request):
    after, ceiling = (
        batch_scope(request.cursor, order_id, user_id, request.mode)
        if request.cursor
        else (0, db.scalar(select(func.max(Photo.id)).where(Photo.order_id == order_id)) or 0)
    )
    query = (
        select(Photo.id, Photo.storage_key)
        .outerjoin(Index, Index.photo_id == Photo.id)
        .where(Photo.order_id == order_id, Photo.id > after, Photo.id <= ceiling)
    )
    eligible = or_(
        Index.id.is_(None), Index.parser_version != PARSER_VERSION, Index.status == "pending"
    )
    if request.mode == "retry":
        eligible = or_(eligible, Index.status.in_(("failed", "unsupported")))
    if request.mode != "refresh":
        query = query.where(eligible)
    rows = db.execute(query.order_by(Photo.id).limit(request.limit + 1)).all()
    db.commit()  # Release the selection transaction before file I/O.
    results, last, processed = [], after, 0
    started = time.monotonic()
    for photo_id, key in rows[: request.limit]:
        if processed and time.monotonic() - started >= BATCH_SECONDS:
            break
        try:
            results.append(index_photo(db, photo_id, key))
        except (IntegrityError, NotFoundException):
            db.rollback()  # Photo deleted between selection and claim: skip, do not resurrect.
            if db.get(Photo, photo_id) is not None:
                raise
        last = photo_id
        processed += 1
    more = len(rows) > processed and last < ceiling
    cursor = (
        batch_cursor([1, order_id, user_id, request.mode, last, ceiling])
        if more and last > after
        else None
    )
    return IndexBatchResponse(
        results=results, next_cursor=cursor, counts=index_counts(db, order_id)
    )
