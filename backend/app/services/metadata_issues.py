"""Authorized callers list bounded diagnostics using SQL only, never original files."""

import base64
import hashlib
import hmac
import json

from sqlalchemy import func, or_, select

from app.core.config import settings
from app.core.exceptions import ValidationException
from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.schemas.metadata_index import IndexIssue, IndexIssues
from app.services import metadata_index as indexing

KINDS = frozenset({"failed", "unsupported", "warnings", "pending"})
ERROR_CODES = frozenset(
    {
        "METADATA_BUSY",
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
        "EXTRACTION_FAILED",
        "METADATA_WARNINGS",
        "LEASE_EXPIRED",
    }
)
RETRY_ERRORS = frozenset(
    {
        "NOT_FOUND",
        "STORAGE_UNAVAILABLE",
        "EXTRACTION_FAILED",
        "VALIDATION_ERROR",
    }
)


def issue_kinds(raw):
    parts = raw.split(",")
    if not parts or len(set(parts)) != len(parts) or set(parts) - KINDS:
        raise ValidationException("Invalid index issue status")
    return sorted(parts)


def issue_cursor(order_id, user_id, kinds, after, ceiling):
    data = json.dumps([1, order_id, user_id, kinds, after, ceiling], separators=(",", ":")).encode()
    sig = hmac.new(
        settings.jwt_secret_key.encode(), b"metadata-issues:" + data, hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(data + sig).decode().rstrip("=")


def decode_cursor(cursor, order_id, user_id, kinds):
    try:
        if len(cursor) > 320:
            raise ValueError
        raw = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        data, sig = raw[:-32], raw[-32:]
        expected = hmac.new(
            settings.jwt_secret_key.encode(), b"metadata-issues:" + data, hashlib.sha256
        ).digest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError
        version, order, user, status, after, ceiling = json.loads(data)
        if (
            (version, order, user, status) != (1, order_id, user_id, kinds)
            or any(type(n) is not int for n in (version, order, user, after, ceiling))
            or not 0 < after <= ceiling <= 2**63 - 1
        ):
            raise ValueError
        return after, ceiling
    except (ValueError, TypeError, UnicodeError):
        raise ValidationException("Invalid metadata issue cursor") from None


def issue_predicates(kinds):
    current = Index.parser_version == indexing.PARSER_VERSION
    clauses = []
    for kind in kinds:
        if kind == "pending":
            clauses.append(
                or_(
                    Index.id.is_(None),
                    Index.parser_version != indexing.PARSER_VERSION,
                    Index.status == "pending",
                )
            )
        elif kind == "warnings":
            clauses.append(current & (Index.status == "indexed") & (Index.warning_count > 0))
        else:
            clauses.append(current & (Index.status == kind))
    return or_(*clauses)


def issue_statement(order_id, kinds, after=0, ceiling=2**63 - 1):
    return (
        select(Photo.id, Photo.filename, Index)
        .outerjoin(Index, Index.photo_id == Photo.id)
        .where(
            Photo.order_id == order_id,
            Photo.id > after,
            Photo.id <= ceiling,
            issue_predicates(kinds),
        )
        .order_by(Photo.id)
    )


def issue_item(photo_id, filename, row):
    identity = (
        "unindexed"
        if row is None
        else "current_parser"
        if row.parser_version == indexing.PARSER_VERSION
        else "stale_parser"
    )
    state = row.status if identity == "current_parser" else "pending"
    error = row.error_code if row is not None else None
    if error is not None and error not in ERROR_CODES:
        error = "INDEX_ERROR"
    active = row is not None and row.lease_expires_at and row.lease_expires_at > indexing.utcnow()
    if state == "pending" and not active and row is not None and row.lease_token:
        error = "LEASE_EXPIRED"
    retryable = (
        (state == "pending" and not active)
        or (state == "indexed")
        or (state == "unsupported" and error == "UNSUPPORTED_STORAGE")
        or (state == "failed" and error in RETRY_ERRORS)
    )
    safe_filename = "".join(c if ord(c) >= 32 else "\ufffd" for c in filename)
    return IndexIssue(
        photo_id=photo_id,
        filename=safe_filename.replace("\\", "/").rsplit("/", 1)[-1][:255],
        index_status=state,
        error_code=error,
        warning_count=max(0, row.warning_count) if row else 0,
        indexed_at=row.indexed_at if row else None,
        retryable=bool(retryable),
        current_parser_version=indexing.PARSER_VERSION,
        parser_version=row.parser_version if row else None,
        identity_state=identity,
        source_verified=False,
    )


def list_issues(db, order_id, user_id, raw_status, limit, cursor):
    kinds = issue_kinds(raw_status)
    after, ceiling = (
        decode_cursor(cursor, order_id, user_id, kinds)
        if cursor
        else (0, db.scalar(select(func.max(Photo.id)).where(Photo.order_id == order_id)) or 0)
    )
    rows = db.execute(issue_statement(order_id, kinds, after, ceiling).limit(limit + 1)).all()
    items = [issue_item(*row) for row in rows[:limit]]
    next_cursor = (
        issue_cursor(order_id, user_id, kinds, items[-1].photo_id, ceiling)
        if len(rows) > limit and items
        else None
    )
    return IndexIssues(items=items, next_cursor=next_cursor)
