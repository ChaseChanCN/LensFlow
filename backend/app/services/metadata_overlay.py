"""No pixel writes. Fresh source reads precede short, ordered CAS transactions."""

import time
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings
from app.core.exceptions import AppException, ConflictException
from app.models.photo import Photo
from app.models.photo_metadata_overlay import PhotoEffectiveKeyword as Keyword
from app.models.photo_metadata_overlay import PhotoKeywordState as State
from app.models.photo_metadata_overlay import PhotoMetadataOverlay as Overlay
from app.schemas.metadata_overlay import (
    LIMITS,
    NAMES,
    OverlayFields,
    clean_text,
    inherit_fields,
    keywords,
)
from app.services.metadata_index import database_failure
from app.services.photo_annotation import authorize_batch
from app.services.photo_metadata import metadata_slot, normalize_metadata
from app.services.storage import get_storage


def parser_version():
    from app.services.metadata_index import PARSER_VERSION

    return PARSER_VERSION + ".desc-v1"


def row_query(photo_id, user_id):
    return select(Overlay).where(Overlay.photo_id == photo_id, Overlay.user_id == user_id)


def fields_of(row):
    return (
        OverlayFields(
            **{
                n: {"mode": getattr(row, n + "_mode"), "value": getattr(row, n + "_value")}
                for n in NAMES
            }
        )
        if row
        else inherit_fields()
    )


def resolve_effective_metadata(original, overlay=None):
    """Pure, bounded, explicit projection. Never exports technical/private metadata."""
    fields = fields_of(overlay)
    warnings = list(original.warnings)
    source = original.description.model_dump(include=set(NAMES))
    for name in NAMES:
        try:
            if name == "keywords":
                # Malformed source metadata must not make all legitimate edits impossible.
                normalized = []
                for value in source[name][:64]:
                    try:
                        normalized.extend(keywords([value]))
                    except ValueError:
                        warnings.append("description.invalid_original_keyword")
                source[name] = keywords(normalized)
                if len(original.description.keywords) > 64:
                    warnings.append("description.original_keywords_truncated")
            elif source[name] is not None:
                if len(source[name]) > LIMITS[name]:
                    warnings.append("description.original_" + name + "_truncated")
                source[name] = clean_text(source[name])[: LIMITS[name]] or None
        except ValueError:
            source[name] = None
            warnings.append("description.invalid_original_" + name)
    effective, provenance = {}, {}
    for name in NAMES:
        state = getattr(fields, name)
        effective[name] = (
            source[name]
            if state.mode == "inherit"
            else state.value
            if state.mode == "override"
            else []
            if name == "keywords"
            else None
        )
        provenance[name] = {
            "mode": state.mode,
            "source": original.provenance.get("description." + name, "original:absent")
            if state.mode == "inherit"
            else "lensflow:" + state.mode,
        }
    changed = bool(overlay and overlay.source_sha256 != original.source_sha256)
    if changed:
        warnings.append("description.source_changed_edits_preserved")
    return dict(
        photo_id=original.photo_id,
        revision=overlay.revision if overlay else 0,
        source_sha256=original.source_sha256,
        source_status="verified_at_read",
        source_changed=changed,
        fields=fields.model_dump(exclude_none=True),
        original=source,
        effective=effective,
        provenance=provenance,
        warnings=sorted(set(warnings)),
    )


def read_sources(photos, errors=None):
    """100 identities maximum; 64 MiB aggregate bytes, 10s between-file budget."""
    if settings.storage_type != "local":
        raise AppException("STORAGE_UNAVAILABLE", "描述元数据暂不支持此存储", status_code=503)
    started, total, result = time.monotonic(), 0, {}
    with metadata_slot():
        for photo in photos:
            if time.monotonic() - started > 10:
                raise AppException(
                    "METADATA_BATCH_BUDGET", "读取预算已满，请减少批量照片数量", status_code=413
                )
            maximum = min(settings.image_max_bytes, 64 * 1024 * 1024 - total)
            try:
                with get_storage().open_read(photo.storage_key) as stream:
                    data = stream.read(maximum + 1)
            except FileNotFoundError:
                if errors is not None:
                    errors.append({"photo_id": photo.id, "code": "SOURCE_UNAVAILABLE"})
                    continue
                raise AppException(
                    "SOURCE_UNAVAILABLE", "原始文件不存在，无法计算继承值", status_code=404
                ) from None
            except OSError:
                if errors is not None:
                    errors.append({"photo_id": photo.id, "code": "STORAGE_UNAVAILABLE"})
                    continue
                raise AppException(
                    "STORAGE_UNAVAILABLE", "原始文件读取失败", status_code=503
                ) from None
            if len(data) > maximum:
                raise AppException(
                    "METADATA_BATCH_BUDGET", "照片或批量总字节超过上限", status_code=413
                )
            total += len(data)
            try:
                result[photo.id] = normalize_metadata(photo.id, data)
            except AppException as exc:
                if errors is None:
                    raise
                errors.append({"photo_id": photo.id, "code": exc.code})
    return result


def load_effective(db, photo, user):
    original = read_sources([photo])[photo.id]
    row = db.scalar(row_query(photo.id, user.id).execution_options(populate_existing=True))
    return resolve_effective_metadata(original, row)


def apply_cas(db, photo_id, user_id, expected, fields, sha):
    now = datetime.now(timezone.utc)
    values = {
        n + "_" + part: getattr(getattr(fields, n), part)
        for n in NAMES
        for part in ("mode", "value")
    }
    values.update(source_sha256=sha, updated_at=now)
    count = db.execute(
        update(Overlay)
        .where(
            Overlay.photo_id == photo_id, Overlay.user_id == user_id, Overlay.revision == expected
        )
        .values(**values, revision=Overlay.revision + 1)
        .execution_options(synchronize_session=False)
    ).rowcount
    if count:
        return True
    if expected:
        return False
    try:
        with db.begin_nested():
            db.add(
                Overlay(photo_id=photo_id, user_id=user_id, revision=1, created_at=now, **values)
            )
            db.flush()
        return True
    except IntegrityError:
        if db.scalar(row_query(photo_id, user_id)) is None:
            raise
        return False


_UNLOADED = object()


def publish_keywords(db, original, row, user_id, state=_UNLOADED):
    resolved = resolve_effective_metadata(original, row)
    if state is _UNLOADED:
        state = db.scalar(
            select(State).where(State.photo_id == original.photo_id, State.user_id == user_id)
        )
    if state is None:
        state = State(photo_id=original.photo_id, user_id=user_id)
        db.add(state)
    state.source_sha256 = original.source_sha256
    state.parser_version = parser_version()
    state.overlay_revision = resolved["revision"]
    state.updated_at = datetime.now(timezone.utc)
    db.flush()
    db.execute(delete(Keyword).where(Keyword.state_id == state.id))
    for position, value in enumerate(resolved["effective"]["keywords"]):
        db.add(
            Keyword(
                state_id=state.id, keyword_key=value.casefold(), display=value, position=position
            )
        )
    db.flush()
    return resolved


def operation_fields(row, original, operation):
    fields = fields_of(row).model_dump(exclude_none=True)
    if operation.type == "fields":
        fields.update({k: v.model_dump(exclude_none=True) for k, v in operation.fields.items()})
    elif operation.type == "keywords_clear":
        fields["keywords"] = {"mode": "clear"}
    elif operation.type == "keywords_inherit":
        fields["keywords"] = {"mode": "inherit"}
    else:
        current = resolve_effective_metadata(original, row)["effective"]["keywords"]
        values = operation.keywords
        if operation.type == "keywords_add":
            merged = {}
            for value in current + values:
                merged.setdefault(value.casefold(), value)
            values = keywords(list(merged.values()))
        elif operation.type == "keywords_remove":
            remove = {v.casefold() for v in values}
            values = [v for v in current if v.casefold() not in remove]
        fields["keywords"] = {"mode": "override", "value": values}
    return OverlayFields.model_validate(fields)


def current_rows(db, ids, user_id):
    return {
        row.photo_id: row
        for row in db.scalars(
            select(Overlay)
            .where(Overlay.photo_id.in_(ids), Overlay.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    }


def current_states(db, ids, user_id):
    return {
        row.photo_id: row
        for row in db.scalars(
            select(State)
            .where(State.photo_id.in_(ids), State.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    }


def mutate(db, user, items, *, fields=None, operation=None):
    ids = [item.photo_id for item in items]
    authorize_batch(db, ids, user)
    photos = db.scalars(select(Photo).where(Photo.id.in_(ids)).order_by(Photo.id)).all()
    keys = {p.id: p.storage_key for p in photos}
    originals = read_sources(photos)
    # End the read transaction before obtaining locks; avoid stale SQLite snapshots.
    db.rollback()
    try:
        authorize_batch(db, ids, user)
        locked = db.scalars(
            select(Photo).where(Photo.id.in_(ids)).order_by(Photo.id).with_for_update()
        ).all()
        if any(keys[p.id] != p.storage_key for p in locked):
            raise ConflictException("原图引用已变化，请重新读取")
        results, statuses = {}, {}
        rows = current_rows(db, ids, user.id)
        states = current_states(db, ids, user.id)
        for item in sorted(items, key=lambda i: i.photo_id):
            row = rows.get(item.photo_id)
            if (row.revision if row else 0) != item.expected_revision:
                statuses[item.photo_id] = False
                continue
            snapshot = (
                fields
                if fields is not None
                else operation_fields(row, originals[item.photo_id], operation)
            )
            statuses[item.photo_id] = apply_cas(
                db,
                item.photo_id,
                user.id,
                item.expected_revision,
                snapshot,
                originals[item.photo_id].source_sha256,
            )
        rows = current_rows(db, ids, user.id)
        for item in sorted(items, key=lambda i: i.photo_id):
            row, success = rows.get(item.photo_id), statuses[item.photo_id]
            resolved = (
                publish_keywords(
                    db, originals[item.photo_id], row, user.id, states.get(item.photo_id)
                )
                if success
                else resolve_effective_metadata(originals[item.photo_id], row)
            )
            results[item.photo_id] = dict(
                photo_id=item.photo_id,
                status="success" if success else "conflict",
                metadata=resolved,
            )
        db.commit()
        ordered = [results[i] for i in ids]
        return dict(
            results=ordered,
            succeeded=sum(v["status"] == "success" for v in ordered),
            conflicted=sum(v["status"] == "conflict" for v in ordered),
        )
    except SQLAlchemyError as exc:
        raise database_failure(db, exc) from None
    except ValueError as exc:
        db.rollback()
        raise AppException("VALIDATION_ERROR", str(exc), status_code=422) from None
    except Exception:
        db.rollback()
        raise


def rebuild(db, user, photos):
    """All reads finish before locks; re-read current overlay under same lock as writes."""
    ids = [p.id for p in photos]
    if not ids:
        return {"processed": [], "errors": []}
    authorize_batch(db, ids, user)
    keys = {p.id: p.storage_key for p in photos}
    errors = []
    originals = read_sources(photos, errors)
    db.rollback()
    try:
        authorize_batch(db, ids, user)
        locked = db.scalars(
            select(Photo).where(Photo.id.in_(ids)).order_by(Photo.id).with_for_update()
        ).all()
        if any(keys[p.id] != p.storage_key for p in locked):
            raise ConflictException("原图引用已变化")
        rows = current_rows(db, ids, user.id)
        states = current_states(db, ids, user.id)
        for photo in locked:
            if photo.id not in originals:
                # A failed refresh must not leave a previously successful projection searchable.
                if states.get(photo.id) is not None:
                    db.delete(states[photo.id])
                continue
            publish_keywords(
                db, originals[photo.id], rows.get(photo.id), user.id, states.get(photo.id)
            )
        db.commit()
        return {"processed": ids, "errors": errors}
    except SQLAlchemyError as exc:
        raise database_failure(db, exc) from None
    except Exception:
        db.rollback()
        raise
