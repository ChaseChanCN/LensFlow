"""Bounded SQL keysets. V2 binds filters/sort; V1 is default-ID-only."""
import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from sqlalchemy import and_, or_, func, select, cast, String, case
from app.core.config import settings
from app.core.exceptions import ValidationException
from app.models.photo import Photo
from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
from app.schemas.photo_annotation import AnnotationResponse
from app.schemas.photo_catalog import PhotoAssetResponse, PhotoCatalogResponse
from app.schemas.catalog_filters import CatalogFilters
from app.models.photo_metadata_index import PhotoMetadataIndex as MetadataIndex
from app.services.metadata_search import metadata_predicates
from app.services.keyword_search import keyword_predicate


def cursor_version(filters):
    return 4 if filters.keywords else 3 if filters.metadata.active else 2


def sign(values):
    payload = json.dumps(values, separators=(',', ':')).encode()
    signature = hmac.new(settings.jwt_secret_key.encode(), b'photo-catalog:' + payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + signature).decode().rstrip('=')


def encode_cursor(order_id, user_id, after, ceiling):
    """Legacy encoder retained for explicit V1 transition and regression tests."""
    return sign([1, order_id, user_id, after, ceiling])


def decode_cursor(cursor, order_id, user_id, filters=CatalogFilters()):
    try:
        if len(cursor) > 512:
            raise ValueError()
        packed = base64.b64decode(cursor + '=' * (-len(cursor) % 4), altchars=b'-_', validate=True)
        payload, signature = packed[:-32], packed[-32:]
        expected = hmac.new(settings.jwt_secret_key.encode(), b'photo-catalog:' + payload, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        values = json.loads(payload)
        if not isinstance(values, list):
            raise ValueError()
        if len(values) == 5 and values[0] == 1 and filters == CatalogFilters():
            version, order, user, after_id, ceiling = values
            after_value = after_id
        elif len(values) == 7 and values[0] == cursor_version(filters) and values[3] == filters.identity():
            version, order, user, _, after_value, after_id, ceiling = values
        else:
            raise ValueError()
        if any(type(v) is not int for v in (version, order, user, after_id, ceiling)) or order != order_id or user != user_id or not 0 < after_id <= ceiling <= 2**63 - 1:
            raise ValueError()
        field = filters.sort.split('_')[0]
        if field == 'created':
            if not isinstance(after_value, str) or len(after_value) > 40:
                raise ValueError()
            after_value = datetime.fromisoformat(after_value)
            if after_value.tzinfo:
                after_value = after_value.astimezone(timezone.utc).replace(tzinfo=None)
        elif type(after_value) is not int or (field == 'rating' and not 0 <= after_value <= 5) or (field == 'id' and after_value != after_id):
            raise ValueError()
        return after_value, after_id, ceiling
    except (ValueError, TypeError, UnicodeError, OverflowError):
        raise ValidationException('Invalid catalog cursor or query scope') from None


def catalog_statement(order_id, user_id, filters, private_annotations, ceiling, after=None, dialect='postgresql'):
    columns = [Photo.id, Photo.order_id, Photo.filename, Photo.mime, Photo.size_bytes, Photo.width, Photo.height, Photo.created_at]
    statement = select(*columns)
    rating = func.coalesce(Annotation.rating, 0)
    if private_annotations:
        statement = statement.add_columns(Annotation.rating, Annotation.color_label, Annotation.pick_status, Annotation.revision, Annotation.updated_at.label('annotation_updated_at')).outerjoin(Annotation, (Annotation.photo_id == Photo.id) & (Annotation.user_id == user_id))
    statement = statement.where(Photo.order_id == order_id, Photo.id <= ceiling)
    if filters.keywords:
        statement = statement.where(keyword_predicate(user_id, filters.keywords))
    if filters.metadata.active:
        statement = statement.outerjoin(MetadataIndex, MetadataIndex.photo_id == Photo.id).where(*metadata_predicates(filters.metadata))
    if filters.rating is not None:
        statement = statement.where(rating == filters.rating)
    if filters.rating_min is not None:
        statement = statement.where(rating >= filters.rating_min)
    if filters.colors:
        statement = statement.where(func.coalesce(Annotation.color_label, 'none').in_(filters.colors))
    if filters.pick:
        statement = statement.where(func.coalesce(Annotation.pick_status, 'unmarked').in_(filters.pick))
    field, direction = filters.sort.split('_')
    key = {'id': Photo.id, 'created': Photo.created_at, 'rating': rating}[field]
    if field == 'created' and dialect == 'sqlite':
        # SQLite server timestamps omit fractional seconds; ORM values include them.
        # Compare canonical six-digit UTC text so an equal second stays equal at page boundaries.
        text = cast(Photo.created_at, String)
        key = case((func.instr(text, '.') == 0, text + '.000000'), else_=func.substr(text + '000000', 1, 26))
    descending = direction == 'desc'
    if after is not None:
        value, photo_id = after
        if field == 'created' and dialect == 'sqlite':
            value = value.isoformat(sep=' ', timespec='microseconds')
        comparison = key < value if descending else key > value
        tie = Photo.id < photo_id if descending else Photo.id > photo_id
        statement = statement.where(or_(comparison, and_(key == value, tie)))
    return statement.order_by(key.desc() if descending else key.asc(), Photo.id.desc() if descending else Photo.id.asc())


def catalog_page(db, order_id, user_id, limit, cursor, *, private_annotations=True, filters=CatalogFilters()):
    if cursor:
        after_value, after_id, ceiling = decode_cursor(cursor, order_id, user_id, filters)
        after = (after_value, after_id)
    else:
        ceiling = db.scalar(select(func.max(Photo.id)).where(Photo.order_id == order_id)) or 0
        after = None
    rows = db.execute(catalog_statement(order_id, user_id, filters, private_annotations, ceiling, after, db.get_bind().dialect.name).limit(limit + 1)).mappings().all()
    items = []
    for row in rows[:limit]:
        asset = PhotoAssetResponse.model_validate(row)
        if private_annotations:
            asset.annotation = AnnotationResponse(photo_id=row['id'], rating=row['rating'] or 0, color_label=row['color_label'], pick_status=row['pick_status'] or 'unmarked', revision=row['revision'] or 0, exists=row['revision'] is not None, updated_at=row['annotation_updated_at'])
        items.append(asset)
    more = len(rows) > limit
    cursor_value = None
    if more:
        last = rows[limit - 1]
        field = filters.sort.split('_')[0]
        value = last['created_at'].isoformat(timespec='microseconds') if field == 'created' else (last['rating'] or 0) if field == 'rating' else last['id']
        cursor_value = sign([cursor_version(filters), order_id, user_id, filters.identity(), value, last['id'], ceiling])
    return PhotoCatalogResponse(items=items, has_more=more, next_cursor=cursor_value)
