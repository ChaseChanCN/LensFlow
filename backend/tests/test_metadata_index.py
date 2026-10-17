"""Real photograph + explicit constructed metadata; never claim camera-original fixtures."""

import hashlib
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date, timedelta
from io import StringIO
from pathlib import Path
from threading import Barrier
from unittest.mock import patch

import pytest
from alembic.config import Config
from sqlalchemy import event, func, select, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import create_access_token
from app.models.photo import Photo
from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.services import metadata_index as service
from app.services.photo_catalog import encode_cursor
from tests.metadata_samples import common_exif, exif_segment, inject, segment


def post(client, headers, photo_id):
    response = client.post(f"/api/v1/photos/{photo_id}/metadata-index", headers=headers, json={})
    assert response.status_code == 200, response.text
    return response.json()


def test_actual_source_identity_reuse_version_change_and_readonly(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    before = path.read_bytes()
    original = tuple(db.execute(text("SELECT * FROM photos")).one())
    first = post(client, headers, photo.id)
    assert (
        first["status"] == "indexed"
        and first["source_sha256"] == hashlib.sha256(before).hexdigest()
    )
    assert first["camera_model"] is None and first["capture_date"] is None
    with patch.object(
        service, "normalize_metadata", side_effect=AssertionError("unnecessary parse")
    ):
        assert post(client, headers, photo.id)["reused"]
    path.write_bytes(inject(common_exif()))
    second = post(client, headers, photo.id)
    assert not second["reused"] and second["camera_model"] == "canon constructed sample"
    assert second["capture_datetime_local"] == "2026-10-17T14:32:18.123456789"
    assert second["capture_timezone_offset_minutes"] == 480 and second["capture_timezone_known"]
    assert second["source_sha256"] != first["source_sha256"]
    monkeypatch.setattr(service, "PARSER_VERSION", "c1-v1.index-test")
    assert not post(client, headers, photo.id)["reused"]
    assert db.scalar(select(func.count()).select_from(Index)) == 1
    assert tuple(db.execute(text("SELECT * FROM photos")).one()) == original
    assert path.read_bytes() == inject(common_exif())
    assert all(
        word not in json.dumps(second)
        for word in ["latitude", "longitude", "serial_number", "PRIVATE-SERIAL", "storage_key"]
    )


def test_unknown_timezone_and_editorial_date_not_substituted(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    data = inject(exif_segment(exif=[(36867, 2, "2026:01:02 00:30:00")]))
    Path(storage.get_path(photo.storage_key)).write_bytes(data)
    result = post(client, headers, photo.id)
    assert (
        result["capture_date"] == "2026-01-02"
        and result["capture_datetime_local"] == "2026-01-02T00:30:00"
    )
    assert (
        result["capture_timezone_offset_minutes"] is None and not result["capture_timezone_known"]
    )


@pytest.mark.parametrize(
    "content,status", [(b"not-jpeg", "unsupported"), (b"\xff\xd8bad", "failed")]
)
def test_failure_states_do_not_break_catalog(client, jpeg_case, content, status):
    db, users, order, photo, storage, headers = jpeg_case
    Path(storage.get_path(photo.storage_key)).write_bytes(content)
    result = post(client, headers, photo.id)
    assert result["status"] == status and result["error_code"]
    assert (
        client.get(f"/api/v1/orders/{order.id}/photos/catalog", headers=headers).json()["items"][0][
            "id"
        ]
        == photo.id
    )


def test_storage_missing_and_optional_metadata_warning(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    monkeypatch.setattr(settings, "storage_type", "obs")
    assert post(client, headers, photo.id)["status"] == "unsupported"
    monkeypatch.setattr(settings, "storage_type", "local")
    path = Path(storage.get_path(photo.storage_key))
    path.write_bytes(inject(segment(0xE1, b"Exif\0\0bad")))
    result = post(client, headers, photo.id)
    assert (
        result["status"] == "indexed"
        and result["warning_count"] > 0
        and result["error_code"] == "METADATA_WARNINGS"
    )
    storage.delete(photo.storage_key)
    assert post(client, headers, photo.id)["status"] == "failed"


def test_stale_pending_recovery_and_busy_lease(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    row = Index(
        photo_id=photo.id,
        status="pending",
        parser_version=service.PARSER_VERSION,
        lease_token="x" * 32,
        lease_expires_at=service.utcnow() + timedelta(seconds=100),
    )
    db.add(row)
    db.commit()
    with patch.object(service, "source_bytes", side_effect=AssertionError("duplicate work")):
        assert post(client, headers, photo.id)["busy"]
    row.lease_expires_at = service.utcnow() - timedelta(seconds=1)
    db.commit()
    assert post(client, headers, photo.id)["status"] == "indexed"


def test_concurrent_photo_claim_and_old_worker_cannot_overwrite(jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    photo_id = photo.id
    key = photo.storage_key
    barrier = Barrier(2)

    def claim():
        with SessionLocal() as session:
            barrier.wait()
            return service.claim(session, photo_id)[0]

    with ThreadPoolExecutor(max_workers=2) as pool:
        tokens = list(pool.map(lambda _: claim(), range(2)))
    assert sum(token is not None for token in tokens) == 1
    row = db.scalar(
        select(Index).where(Index.photo_id == photo_id).execution_options(populate_existing=True)
    )
    row.lease_expires_at = service.utcnow() - timedelta(seconds=1)
    db.commit()
    # Replace the expired lease during parsing. Finishing old work must not publish.
    original = service.normalize_metadata

    def steal(id, data):
        with SessionLocal() as other:
            record = other.scalar(select(Index).where(Index.photo_id == id))
            record.lease_expires_at = service.utcnow() - timedelta(seconds=1)
            other.commit()
            newer, _ = service.claim(other, id)
            assert newer
        return original(id, data)

    with patch.object(service, "normalize_metadata", side_effect=steal):
        result = service.index_photo(db, photo_id, key)
    assert result.status == "pending"


def test_batch_bounds_resume_retry_counts_and_source_hash(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    for i in range(13):
        db.add(
            Photo(
                order_id=order.id,
                filename=f"{i}.jpg",
                storage_key=photo.storage_key,
                size_bytes=73746,
            )
        )
    db.commit()
    url = f"/api/v1/orders/{order.id}/metadata-index"
    status = client.get(url + "/status", headers=headers).json()
    assert status["unindexed"] == status["pending"] == 14
    cursor = None
    seen = []
    while True:
        r = client.post(url, json={"limit": 3, "cursor": cursor}, headers=headers)
        assert r.status_code == 200, r.text
        batch = r.json()
        assert 1 <= len(batch["results"]) <= 3
        seen.extend(x["photo_id"] for x in batch["results"])
        cursor = batch["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == 14 and batch["counts"]["indexed"] == 14
    assert client.post(url, json={}, headers=headers).json()["results"] == []
    assert client.post(url, json={"limit": 11}, headers=headers).status_code == 422
    assert client.post(url, json={"source_sha256": "x"}, headers=headers).status_code == 422
    first = client.post(url, json={"mode": "refresh", "limit": 1}, headers=headers).json()
    assert first["next_cursor"] and first["results"][0]["reused"]
    assert (
        client.post(
            url, json={"mode": "retry", "cursor": first["next_cursor"]}, headers=headers
        ).status_code
        == 422
    )


@pytest.mark.parametrize("role_index", [1, 2, 3, 4])
def test_all_private_endpoints_and_metadata_filters_are_owned(client, jpeg_case, role_index):
    db, users, order, photo, storage, headers = jpeg_case
    headers = {"Authorization": "Bearer " + create_access_token(str(users[role_index].id))}
    for method, path, body in [
        ("POST", f"/photos/{photo.id}/metadata-index", {}),
        ("POST", f"/orders/{order.id}/metadata-index", {}),
        ("GET", f"/orders/{order.id}/metadata-index/status", None),
        ("GET", f"/orders/{order.id}/photos/metadata-facets", None),
        ("GET", f"/orders/{order.id}/photos/timeline", None),
    ]:
        assert (
            client.request(
                method,
                "/api/v1" + path,
                headers=headers,
                **({"json": body} if body is not None else {}),
            ).status_code
            == 403
        )
    assert (
        client.get(
            f"/api/v1/orders/{order.id}/photos/catalog?camera_model=canon", headers=headers
        ).status_code
        == 403
    )


@pytest.fixture
def indexed_catalog(jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    rows = []
    for i in range(1007):
        asset = (
            photo
            if i == 0
            else Photo(
                order_id=order.id, filename=f"p{i}.jpg", storage_key="not-read", size_bytes=1
            )
        )
        db.add(asset)
        db.flush()
        rows.append(asset.id)
        if i % 11 == 0:
            continue
        db.add(
            Index(
                photo_id=asset.id,
                source_sha256="a" * 64,
                parser_version=service.PARSER_VERSION,
                status="indexed",
                indexed_at=service.utcnow(),
                camera_make="canon",
                camera_model="eos 70d" if i % 2 else "eos 700d",
                lens_make="canon",
                lens_model="50mm" if i % 3 else "35mm",
                iso=100 * (i % 5 + 1),
                focal_length_mm=50 if i % 3 else 35,
                f_number=2.8 if i % 2 else 8,
                exposure_seconds=0.008,
                capture_datetime_local="2026-01-02T03:04:05",
                capture_date=None if i % 7 == 0 else date(2025 + i % 2, 1 + i % 3, 1 + i % 25),
            )
        )
        if i % 4:
            db.add(
                Annotation(
                    photo_id=asset.id,
                    user_id=users[0].id,
                    rating=i % 6,
                    color_label=None,
                    pick_status="pick",
                    revision=1,
                )
            )
    db.commit()
    return db, users, order, headers, rows


def all_ids(client, order, headers, params):
    cursor = None
    result = []
    while True:
        r = client.get(
            f"/api/v1/orders/{order}/photos/catalog",
            headers=headers,
            params={**params, "limit": 41, **({"cursor": cursor} if cursor else {})},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        result.extend(x["id"] for x in data["items"])
        cursor = data["next_cursor"]
        if not cursor:
            return result


@pytest.mark.parametrize(
    "params",
    [
        {"camera_model": " EOS 70D "},
        {"lens_model": "50mm"},
        {"camera_make": "CANON", "lens_make": "canon"},
        {"iso_min": "200", "iso_max": "400"},
        {"focal_min": "35", "focal_max": "35"},
        {"aperture_min": "2.8", "aperture_max": "2.8"},
        {"captured_from": "2026-01-01", "captured_to": "2026-12-31"},
        {"capture_unknown": "true"},
        {"rating_min": 4, "pick": "pick", "camera_model": "eos 70d"},
    ],
)
def test_sql_metadata_filters_against_independent_expected(client, indexed_catalog, params):
    db, users, order, headers, ids = indexed_catalog
    expected = []
    for i, id in enumerate(ids):
        if i % 11 == 0:
            continue
        if "camera_model" in params and i % 2 == 0:
            continue
        if params.get("lens_model") == "50mm" and i % 3 == 0:
            continue
        if "iso_min" in params and not 200 <= 100 * (i % 5 + 1) <= 400:
            continue
        if "focal_min" in params and i % 3 != 0:
            continue
        if "aperture_min" in params and i % 2 == 0:
            continue
        if "captured_from" in params and (i % 7 == 0 or i % 2 == 0):
            continue
        if "capture_unknown" in params and i % 7 != 0:
            continue
        if "rating_min" in params and (i % 4 == 0 or i % 6 < 4):
            continue
        expected.append(id)
    with patch.object(service, "source_bytes", side_effect=AssertionError("query file read")):
        assert all_ids(client, order.id, headers, params) == expected


def test_cursor_compatibility_identity_live_membership_and_query_bound(client, indexed_catalog):
    db, users, order, headers, ids = indexed_catalog
    url = f"/api/v1/orders/{order.id}/photos/catalog"
    page = client.get(url, headers=headers, params={"camera_model": "eos 70d", "limit": 3}).json()
    cursor = page["next_cursor"]
    assert len(cursor) <= 512
    for params in [
        {"cursor": cursor},
        {"cursor": cursor, "camera_model": "eos 700d"},
        {"cursor": cursor + "X", "camera_model": "eos 70d"},
    ]:
        assert client.get(url, headers=headers, params=params).status_code == 422
    assert (
        client.get(
            url, headers=headers, params={"cursor": cursor, "camera_model": " EOS 70D "}
        ).status_code
        == 200
    )
    legacy = encode_cursor(order.id, users[0].id, ids[0], ids[-1])
    assert client.get(url, headers=headers, params={"cursor": legacy}).status_code == 200
    assert (
        client.get(
            url, headers=headers, params={"cursor": legacy, "camera_model": "eos 70d"}
        ).status_code
        == 422
    )
    statements = []

    def record(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", record)
    try:
        r = client.get(url, headers=headers, params={"iso_min": 200, "rating_min": 3})
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert r.status_code == 200 and len(statements) <= 4
    # Live membership: an indexed row may join subsequent pages; refresh restarts the UI sequence.
    pending_id = next(
        id for i, id in enumerate(ids) if i % 11 == 0 and id > page["items"][-1]["id"]
    )
    db.add(
        Index(
            photo_id=pending_id,
            source_sha256="b" * 64,
            parser_version=service.PARSER_VERSION,
            status="indexed",
            indexed_at=service.utcnow(),
            camera_model="eos 70d",
        )
    )
    db.commit()
    nextpage = client.get(
        url, headers=headers, params={"camera_model": "eos 70d", "cursor": cursor, "limit": 100}
    ).json()
    assert pending_id in [x["id"] for x in nextpage["items"]]


def test_facets_timeline_status_and_unknown_groups(client, indexed_catalog):
    db, users, order, headers, ids = indexed_catalog
    base = f"/api/v1/orders/{order.id}"
    facets = client.get(base + "/photos/metadata-facets", headers=headers).json()
    assert {x["value"] for x in facets["camera_model"]} == {"eos 70d", "eos 700d"}
    assert facets["counts"]["total"] == 1007 and facets["counts"]["unindexed"] > 0
    year = client.get(base + "/photos/timeline", headers=headers).json()
    assert (
        sum(b["count"] for b in year["buckets"]) + year["unknown"]
        == year["matched"]
        == facets["counts"]["indexed"]
    )
    assert {b["date"] for b in year["buckets"]} == {"2025", "2026"}
    month = client.get(base + "/photos/timeline?level=month&year=2026", headers=headers).json()
    assert sum(b["count"] for b in month["buckets"]) == next(
        b["count"] for b in year["buckets"] if b["date"] == "2026"
    )
    day = client.get(
        base + "/photos/timeline?level=day&year=2026&month=1&pick=pick", headers=headers
    ).json()
    assert all(b["date"].startswith("2026-01-") for b in day["buckets"])
    assert client.get(base + "/photos/timeline?level=day", headers=headers).status_code == 422
    assert all(
        t not in json.dumps(facets) + json.dumps(year)
        for t in ["latitude", "serial_number", "storage_key"]
    )


@pytest.mark.parametrize(
    "query",
    [
        "iso_min=NaN",
        "iso_max=Infinity",
        "iso_min=1.0",
        "focal_min=-1",
        "aperture_max=1025",
        "iso_min=400&iso_max=100",
        "camera_model=",
        "camera_model=" + ("x" * 161),
        "captured_from=2026-02-30",
        "captured_to=2025-01-01&captured_from=2026-01-01",
        "capture_unknown=true&captured_from=2026-01-01",
        "camera_model=x&metadata_status=failed",
        "metadata_status=bad",
        "lens_model=x&lens_model=y",
    ],
)
def test_invalid_metadata_queries(client, jpeg_case, query):
    assert (
        client.get(
            f"/api/v1/orders/{jpeg_case[2].id}/photos/catalog?{query}", headers=jpeg_case[-1]
        ).status_code
        == 422
    )


def test_migration_constraints_deletion_and_business_immutability(
    tmp_path, monkeypatch, jpeg_case, client
):
    target = tmp_path / "index-migration.sqlite"
    monkeypatch.setattr(settings, "db_sqlite_path", target.as_posix())
    config = Config("alembic.ini")
    command.upgrade(config, "c4e6a8b0d212")
    with closing(sqlite3.connect(target)) as db, db:
        db.execute(
            "INSERT INTO photos(id,order_id,filename,storage_key,mime,size_bytes) "
            "VALUES(1,1,'real.jpg','read-only','image/jpeg',73746)"
        )
        before = db.execute("SELECT * FROM photos").fetchall()
    command.upgrade(config, "head")
    with closing(sqlite3.connect(target)) as db:
        assert (
            db.execute("SELECT * FROM photos").fetchall() == before
            and db.execute("SELECT count(*) FROM photo_metadata_indexes").fetchone()[0] == 0
        )
    command.downgrade(config, "c4e6a8b0d212")
    with closing(sqlite3.connect(target)) as db:
        assert db.execute("SELECT * FROM photos").fetchall() == before
    db, users, order, photo, storage, headers = jpeg_case
    post(client, headers, photo.id)
    for patch_value in [
        {"source_sha256": "G" * 64},
        {"iso": 0},
        {"f_number": 0},
        {"status": "invented"},
        {"parser_version": ""},
    ]:
        with SessionLocal() as separate:
            row = separate.scalar(select(Index))
            for key, value in patch_value.items():
                setattr(row, key, value)
            with pytest.raises(IntegrityError):
                separate.commit()
    db.delete(photo)
    db.commit()
    assert db.scalar(select(func.count()).select_from(Index)) == 0
    monkeypatch.setattr(settings, "db_type", "postgresql")
    output = StringIO()
    config = Config("alembic.ini", output_buffer=output)
    command.upgrade(config, "c4e6a8b0d212:d5f7a9c1e323", sql=True)
    assert (
        "CREATE TABLE photo_metadata_indexes" in output.getvalue()
        and "ALTER TABLE photos" not in output.getvalue()
    )
    db.close()
    engine.dispose()
