"""SQL-only keyword membership. Coverage is known-at-index, never a live-file claim."""

import json

from sqlalchemy import and_, exists, func, or_, select

from app.core.exceptions import ValidationException
from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.models.photo_metadata_overlay import PhotoEffectiveKeyword as Keyword
from app.models.photo_metadata_overlay import PhotoKeywordState as State
from app.models.photo_metadata_overlay import PhotoMetadataOverlay as Overlay
from app.schemas.metadata_overlay import keywords
from app.services.metadata_overlay import parser_version


def parse_keywords(value):
    if value is None:
        return ()
    try:
        values = json.loads(value)
        if not isinstance(values, list) or not 1 <= len(values) <= 10:
            raise ValueError()
        return tuple(sorted(v.casefold() for v in keywords(values)))
    except (ValueError, TypeError):
        raise ValidationException("keywords 必须是 1–10 个关键词的 JSON 数组") from None


def valid_state(user_id):
    from app.services.metadata_index import PARSER_VERSION

    revision = (
        select(Overlay.revision)
        .where(Overlay.photo_id == State.photo_id, Overlay.user_id == user_id)
        .correlate(State)
        .scalar_subquery()
    )
    # If C2 has observed a new source/parser or is rebuilding/failed, exclude stale C4 rows.
    known_mismatch = exists(
        select(Index.id).where(
            Index.photo_id == State.photo_id,
            or_(
                Index.status != "indexed",
                Index.parser_version != PARSER_VERSION,
                Index.source_sha256 != State.source_sha256,
                Index.source_sha256.is_(None),
            ),
        )
    )
    return and_(
        State.user_id == user_id,
        State.parser_version == parser_version(),
        State.overlay_revision == func.coalesce(revision, 0),
        ~known_mismatch,
    )


def keyword_predicate(user_id, values):
    # Multi-keyword AND, implemented as EXISTS for each term. No JOIN row explosion.
    return and_(
        *[
            exists(
                select(State.id)
                .join(Keyword, Keyword.state_id == State.id)
                .where(
                    State.photo_id == Photo.id, valid_state(user_id), Keyword.keyword_key == value
                )
            )
            for value in values
        ]
    )


def keyword_coverage(db, order_id, user_id):
    total = db.scalar(select(func.count()).select_from(Photo).where(Photo.order_id == order_id))
    indexed = db.scalar(
        select(func.count())
        .select_from(State)
        .join(Photo, Photo.id == State.photo_id)
        .where(Photo.order_id == order_id, valid_state(user_id))
    )
    return dict(
        total=total,
        indexed=indexed,
        unknown=total - indexed,
        complete=total == indexed,
        source_freshness="verified_at_index_only",
        parser_version=parser_version(),
    )
