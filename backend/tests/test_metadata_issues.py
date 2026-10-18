"""Bounded diagnostics must never re-read originals or leak raw metadata."""

import json
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.core.security import create_access_token
from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.services import metadata_index as service
from app.services.schema_readiness import schema_ready


@pytest.fixture
def issues_case(jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    ids = [photo.id]
    for i in range(6):
        item = Photo(
            order_id=order.id,
            filename=f"example-{i}.jpg",
            storage_key="private-storage-key",
            size_bytes=1,
        )
        db.add(item)
        db.flush()
        ids.append(item.id)
    states = [
        ("failed", "NOT_FOUND", 0),
        ("unsupported", "UNSUPPORTED_FORMAT", 0),
        ("indexed", "METADATA_WARNINGS", 3),
        ("pending", None, 0),
        ("failed", "private /path GPS secret", 0),
        ("failed", "NOT_FOUND", 0),
    ]
    for id, (state, code, warnings) in zip(ids, states):
        db.add(
            Index(
                photo_id=id,
                status=state,
                parser_version=service.PARSER_VERSION,
                error_code=code,
                warning_count=warnings,
                source_sha256="a" * 64 if state == "indexed" else None,
                indexed_at=service.utcnow() if state == "indexed" else None,
            )
        )
    db.commit()
    return (*jpeg_case, ids)


def test_issues_are_private_bounded_and_do_not_read_source(client, issues_case):
    db, users, order, photo, storage, headers, ids = issues_case
    with patch.object(service, "source_bytes", side_effect=AssertionError("must not read source")):
        response = client.get(f"/api/v1/orders/{order.id}/metadata-index/issues", headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("private, no-store")
    data = response.json()
    assert len(data["items"]) == 5
    for item in data["items"]:
        assert not item["source_verified"] and item["identity_state"] == "current_parser"
    assert not any(
        key in json.dumps(data)
        for key in ["GPS", "private /path", "storage_key", "source_sha256", "serial"]
    )
    warning = next(x for x in data["items"] if x["warning_count"])
    assert warning["indexed_at"].endswith("Z") and warning["retryable"]
    unsupported = next(x for x in data["items"] if x["index_status"] == "unsupported")
    assert not unsupported["retryable"]


@pytest.mark.parametrize("user", [None, 1, 2, 3, 4])
def test_issue_authorization_before_query(client, jpeg_case, user):
    db, users, order, photo, storage, headers = jpeg_case
    denied = (
        {}
        if user is None
        else {"Authorization": "Bearer " + create_access_token(str(users[user].id))}
    )
    response = client.get(f"/api/v1/orders/{order.id}/metadata-index/issues", headers=denied)
    assert response.status_code == (401 if user is None else 403)
    assert "no-store" in response.headers["cache-control"]


def test_issues_cursor_identity_paging_and_no_duplicates(client, issues_case):
    db, users, order, photo, storage, headers, ids = issues_case
    url = f"/api/v1/orders/{order.id}/metadata-index/issues"
    cursor, actual = None, []
    while True:
        data = client.get(
            url, params={"limit": 2, **({"cursor": cursor} if cursor else {})}, headers=headers
        ).json()
        actual.extend(x["photo_id"] for x in data["items"])
        cursor = data["next_cursor"]
        if not cursor:
            break
    assert actual == [ids[i] for i in [0, 1, 2, 4, 5]]
    first = client.get(url, params={"limit": 1}, headers=headers).json()["next_cursor"]
    for params in [{"cursor": first, "status": "failed"}, {"cursor": first[:-1] + "!"}]:
        assert client.get(url, params=params, headers=headers).status_code == 422
    # Canonical category order is equivalent.
    assert (
        client.get(
            url, params={"cursor": first, "status": "warnings,failed,unsupported"}, headers=headers
        ).status_code
        == 200
    )


def test_pending_unknown_old_parser_and_lease_recovery_classification(client, issues_case):
    db, users, order, photo, storage, headers, ids = issues_case
    row = db.scalar(select(Index).where(Index.photo_id == ids[0]))
    row.parser_version = "old-parser"
    pending = db.scalar(select(Index).where(Index.photo_id == ids[3]))
    pending.lease_token = "a" * 32
    pending.lease_expires_at = service.utcnow() - timedelta(seconds=1)
    db.commit()
    response = client.get(
        f"/api/v1/orders/{order.id}/metadata-index/issues?status=pending", headers=headers
    )
    items = {x["photo_id"]: x for x in response.json()["items"]}
    assert items[ids[0]]["identity_state"] == "stale_parser"
    assert items[ids[3]]["error_code"] == "LEASE_EXPIRED" and items[ids[3]]["retryable"]
    assert (
        items[ids[6]]["identity_state"] == "unindexed" and items[ids[6]]["parser_version"] is None
    )
    pending.lease_expires_at = service.utcnow() + timedelta(seconds=60)
    db.commit()
    items = client.get(
        f"/api/v1/orders/{order.id}/metadata-index/issues?status=pending", headers=headers
    ).json()["items"]
    assert not next(x for x in items if x["photo_id"] == ids[3])["retryable"]


@pytest.mark.parametrize(
    "query",
    [
        "status=",
        "status=failed,failed",
        "status=gps",
        "status=Failed",
        "limit=0",
        "limit=51",
        "cursor=",
        "status=failed&status=warnings",
        "storage_key=secret",
    ],
)
def test_invalid_diagnostic_query(client, jpeg_case, query):
    db, users, order, photo, storage, headers = jpeg_case
    assert (
        client.get(
            f"/api/v1/orders/{order.id}/metadata-index/issues?{query}", headers=headers
        ).status_code
        == 422
    )


def test_safe_postgres_url_configuration_roundtrips():
    settings = Settings(
        _env_file=None, db_type="postgresql", db_pg_password="p@ss:/%#?", db_pg_user="user@name"
    )
    for value in [settings.database_url, settings.sync_database_url]:
        url = make_url(value)
        assert url.password == "p@ss:/%#?" and url.username == "user@name"


def test_readiness_never_creates_missing_schema(jpeg_case):
    db, *_ = jpeg_case
    before = db.execute(text("SELECT name FROM sqlite_master ORDER BY name")).all()
    assert not schema_ready(
        db.get_bind()
    )  # create_all test schema intentionally has no Alembic stamp.
    after = db.execute(text("SELECT name FROM sqlite_master ORDER BY name")).all()
    assert before == after


def test_missing_index_table_is_actionable_and_private(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    order_id, bind = order.id, db.get_bind()
    db.close()
    with bind.begin() as connection:
        connection.execute(text("DROP TABLE photo_metadata_indexes"))
    response = client.get(f"/api/v1/orders/{order_id}/metadata-index/issues", headers=headers)
    assert response.status_code == 503 and response.json()["code"] == "SCHEMA_NOT_READY"
    assert "no-store" in response.headers["cache-control"]
