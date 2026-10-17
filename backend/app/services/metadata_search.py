"""SQL predicates and bounded aggregates; never parse or hash a source during queries."""

import calendar
from datetime import date

from sqlalchemy import extract, func, or_, select

from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.schemas.metadata_filters import DEVICE_FIELDS
from app.schemas.metadata_index import MetadataFacets, MetadataTimeline, TimelineBucket
from app.services.metadata_index import PARSER_VERSION, current_index, index_counts


def metadata_predicates(filters):
    result = []
    if filters.needs_indexed or filters.metadata_status == "indexed":
        result.append(current_index())
    elif filters.metadata_status == "pending":
        result.append(
            or_(
                Index.id.is_(None),
                Index.parser_version != PARSER_VERSION,
                Index.status == "pending",
            )
        )
    elif filters.metadata_status:
        result.extend(
            [Index.parser_version == PARSER_VERSION, Index.status == filters.metadata_status]
        )
    for key in DEVICE_FIELDS:
        if (value := getattr(filters, key)) is not None:
            result.append(getattr(Index, key) == value)
    for name, column in (
        ("iso", Index.iso),
        ("focal", Index.focal_length_mm),
        ("aperture", Index.f_number),
    ):
        if (value := getattr(filters, name + "_min")) is not None:
            result.append(column >= value)
        if (value := getattr(filters, name + "_max")) is not None:
            result.append(column <= value)
    if filters.captured_from:
        result.append(Index.capture_date >= date.fromisoformat(filters.captured_from))
    if filters.captured_to:
        result.append(Index.capture_date <= date.fromisoformat(filters.captured_to))
    if filters.capture_unknown:
        result.append(Index.capture_date.is_(None))
    return result


def facets(db, order_id):
    values, truncated = {}, False
    for name in DEVICE_FIELDS:
        column = getattr(Index, name)
        rows = db.execute(
            select(column, func.count())
            .join(Photo, Photo.id == Index.photo_id)
            .where(Photo.order_id == order_id, current_index(), column.is_not(None))
            .group_by(column)
            .order_by(column)
            .limit(51)
        ).all()
        values[name] = [{"value": value, "count": count} for value, count in rows[:50]]
        truncated = truncated or len(rows) > 50
    return MetadataFacets(**values, truncated=truncated, counts=index_counts(db, order_id))


def timeline(db, order_id, user_id, filters, level, year=None, month=None):
    from app.services.photo_catalog import catalog_statement

    # Reuse all catalog predicates, including private annotation defaults, without keyset/sort.
    ceiling = 2**63 - 1
    base = catalog_statement(order_id, user_id, filters, True, ceiling).order_by(None)
    if not filters.metadata.active:
        base = base.outerjoin(Index, Index.photo_id == Photo.id)
    base = base.where(current_index())
    matched = db.scalar(base.with_only_columns(func.count(Photo.id))) or 0
    unknown = (
        db.scalar(base.where(Index.capture_date.is_(None)).with_only_columns(func.count(Photo.id)))
        or 0
    )
    if year is not None:
        base = base.where(extract("year", Index.capture_date) == year)
    if month is not None:
        base = base.where(extract("month", Index.capture_date) == month)
    # Date ISO text is an output label only. Group on native numeric date extracts.
    parts = [extract("year", Index.capture_date)]
    if level in ("month", "day"):
        parts.append(extract("month", Index.capture_date))
    if level == "day":
        parts.append(extract("day", Index.capture_date))
    rows = db.execute(
        base.where(Index.capture_date.is_not(None))
        .with_only_columns(*parts, func.count(Photo.id))
        .group_by(*parts)
        .order_by(*parts)
        .limit(201)
    ).all()
    buckets = []
    for row in rows[:200]:
        y, m, d = (
            int(row[0]),
            int(row[1]) if len(parts) > 1 else 1,
            int(row[2]) if len(parts) > 2 else 1,
        )
        start = date(y, m, d)
        end = (
            date(y, 12, 31)
            if level == "year"
            else date(y, m, calendar.monthrange(y, m)[1])
            if level == "month"
            else start
        )
        buckets.append(
            TimelineBucket(
                date=start.isoformat()[: {"year": 4, "month": 7, "day": 10}[level]],
                count=row[-1],
                captured_from=start.isoformat(),
                captured_to=end.isoformat(),
            )
        )
    return MetadataTimeline(
        level=level,
        buckets=buckets,
        unknown=unknown,
        matched=matched,
        counts=index_counts(db, order_id),
        truncated=len(rows) > 200,
    )
