import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import DataError, IntegrityError, OperationalError

from app.core.security import create_access_token
from app.models.order import Order
from app.models.photo import Photo
from app.models.photo_metadata_overlay import PhotoKeywordState as State
from app.models.photo_metadata_overlay import PhotoMetadataOverlay as Overlay
from app.schemas.metadata_overlay import inherit_fields
from app.services import metadata_overlay as service
from app.services.metadata_sidecar import serialize_sidecar
from tests.metadata_samples import inject, segment


def snapshot(revision=0, **values):
    fields = inherit_fields().model_dump(exclude_none=True)
    fields.update(values)
    return dict(expected_revision=revision, fields=fields)


def paths(photo):
    return (
        f"/api/v1/photos/{photo.id}/metadata-effective",
        f"/api/v1/photos/{photo.id}/metadata-overlay",
    )


def original_keywords(path, values=("人像", "Studio")):
    from xml.sax.saxutils import escape

    xmp = (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/" '
        'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        "<rdf:RDF><rdf:Description>"
        '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">原始标题</rdf:li></rdf:Alt></dc:title>'
        "<dc:subject><rdf:Bag>"
        + "".join("<rdf:li>" + escape(v) + "</rdf:li>" for v in values)
        + "</rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>"
    )
    Path(path).write_bytes(inject(segment(0xE1, b"http://ns.adobe.com/xap/1.0/\0" + xmp.encode())))


def test_modes_cas_reset_immutability(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    original_keywords(path)
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    key = photo.storage_key
    get, put = paths(photo)
    result = client.get(get, headers=headers)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["revision"] == 0 and data["effective"]["title"] == "原始标题"
    assert data["effective"]["keywords"] == ["人像", "Studio"]
    assert db.scalar(select(func.count()).select_from(Overlay)) == 0
    saved = client.put(
        put,
        json=snapshot(
            title={"mode": "clear"},
            caption={"mode": "override", "value": "北京 & <纪实>"},
            keywords={
                "mode": "override",
                "value": [" 人像 ", "STUDIO", "studio", "Cafe\u0301", "Café"],
            },
        ),
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    value = saved.json()
    assert value["revision"] == 1 and value["effective"]["title"] is None
    assert value["effective"]["keywords"] == ["人像", "STUDIO", "Café"]
    assert value["provenance"]["title"] == {"mode": "clear", "source": "lensflow:clear"}
    conflict = client.put(put, json=snapshot(), headers=headers)
    assert conflict.status_code == 409 and conflict.json()["current"]["revision"] == 1
    assert (
        client.request("DELETE", put, json={"expected_revision": 0}, headers=headers).status_code
        == 409
    )
    reset = client.request("DELETE", put, json={"expected_revision": 1}, headers=headers)
    assert reset.status_code == 200 and reset.json()["revision"] == 2
    assert reset.json()["effective"]["title"] == "原始标题"
    assert client.put(put, json=snapshot(2), headers=headers).json()["revision"] == 3
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    db.refresh(photo)
    assert photo.storage_key == key


@pytest.mark.parametrize(
    "field",
    [
        {"mode": "bad"},
        {"mode": "inherit", "value": "x"},
        {"mode": "clear", "value": []},
        {"mode": "override"},
        {"mode": "override", "value": True},
        {"mode": "override", "value": ""},
        {"mode": "override", "value": "x" * 513},
        {"mode": "override", "value": "a\0b"},
        {"mode": "override", "value": "x", "extra": 1},
    ],
)
def test_invalid_fields(client, jpeg_case, field):
    assert (
        client.put(
            paths(jpeg_case[3])[1], json=snapshot(title=field), headers=jpeg_case[-1]
        ).status_code
        == 422
    )


@pytest.mark.parametrize("value", [[""], ["  "], [1], ["x" * 129], ["x"] * 65, ["a\nb"], "x"])
def test_invalid_keywords(client, jpeg_case, value):
    assert (
        client.put(
            paths(jpeg_case[3])[1],
            json=snapshot(keywords={"mode": "override", "value": value}),
            headers=jpeg_case[-1],
        ).status_code
        == 422
    )


def test_contract_privacy_bounds(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    get, put = paths(photo)
    for actor in [None, *users[1:]]:
        auth = (
            {}
            if actor is None
            else {"Authorization": "Bearer " + create_access_token(str(actor.id))}
        )
        expected = 401 if actor is None else 403
        assert client.get(get, headers=auth).status_code == expected
        assert client.put(put, headers=auth, json=snapshot()).status_code == expected
        assert (
            client.get(f"/api/v1/photos/{photo.id}/metadata-sidecar.xmp", headers=auth).status_code
            == expected
        )
    for value in [True, "0", -1, 1.0]:
        assert client.put(put, json=snapshot(value), headers=headers).status_code == 422
    for body in [
        {**snapshot(), "source_sha256": "f" * 64},
        {"expected_revision": 0, "fields": {}},
        {**snapshot(), "user_id": 1},
    ]:
        assert client.put(put, json=body, headers=headers).status_code == 422
    assert (
        client.put(
            put, content=b" " * 131073, headers={**headers, "Content-Type": "application/json"}
        ).status_code
        == 413
    )
    assert (
        client.get("/api/v1/photos/999999/metadata-effective", headers=headers).status_code == 404
    )


def test_batch_effective_keywords_conflicts_authorization_and_rollback(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    original_keywords(storage.get_path(photo.storage_key))
    second = Photo(
        order_id=order.id,
        filename="b.jpg",
        storage_key=photo.storage_key,
        mime="image/jpeg",
        size_bytes=1,
    )
    db.add(second)
    db.commit()
    ids = [photo.id, second.id]
    batch = "/api/v1/photos/metadata-overlays/batch"

    def post(revisions, operation):
        return client.post(
            batch,
            headers=headers,
            json={
                "items": [{"photo_id": i, "expected_revision": r} for i, r in zip(ids, revisions)],
                "operation": operation,
            },
        )

    result = post([0, 0], {"type": "keywords_add", "keywords": ["Portfolio"]})
    assert result.status_code == 200, result.text
    assert result.json()["succeeded"] == 2
    assert result.json()["results"][0]["metadata"]["effective"]["keywords"] == [
        "人像",
        "Studio",
        "Portfolio",
    ]
    result = post([0, 1], {"type": "keywords_remove", "keywords": ["STUDIO"]}).json()
    assert [r["status"] for r in result["results"]] == ["conflict", "success"]
    assert result["results"][1]["metadata"]["effective"]["keywords"] == ["人像", "Portfolio"]
    for op, expected in [
        ({"type": "keywords_replace", "keywords": ["甲"]}, ["甲"]),
        ({"type": "keywords_clear"}, []),
        ({"type": "keywords_inherit"}, ["人像", "Studio"]),
    ]:
        revisions = [
            client.get(paths(photo)[0], headers=headers).json()["revision"],
            client.get(paths(second)[0], headers=headers).json()["revision"],
        ]
        value = post(revisions, op).json()
        assert (
            value["succeeded"] == 2
            and value["results"][0]["metadata"]["effective"]["keywords"] == expected
        )
    revisions = [r["metadata"]["revision"] for r in value["results"]]
    value = post(
        revisions,
        {"type": "fields", "fields": {"creator": {"mode": "override", "value": "摄影师"}}},
    ).json()
    assert value["results"][0]["metadata"]["effective"]["keywords"] == ["人像", "Studio"]
    revisions = [r["metadata"]["revision"] for r in value["results"]]
    other = Order(
        booking_id=2, photographer_id=users[1].id, client_id=users[2].id, status="WAITING_UPLOAD"
    )
    db.add(other)
    db.flush()
    hidden = Photo(order_id=other.id, filename="private", storage_key="private", size_bytes=1)
    db.add(hidden)
    db.commit()
    for forbidden in [hidden.id, 999999]:
        with patch.object(service, "read_sources", side_effect=AssertionError("unauthorized IO")):
            result = client.post(
                batch,
                headers=headers,
                json={
                    "items": [
                        {"photo_id": ids[0], "expected_revision": revisions[0]},
                        {"photo_id": forbidden, "expected_revision": 0},
                    ],
                    "operation": {"type": "keywords_clear"},
                },
            )
            assert result.status_code == 403
    original = service.publish_keywords
    calls = []

    def fail(*args):
        calls.append(1)
        if len(calls) == 2:
            raise OperationalError("forced", {}, Exception())
        return original(*args)

    with patch.object(service, "publish_keywords", side_effect=fail):
        assert post(revisions, {"type": "keywords_clear"}).status_code == 503
    for id, rev in zip(ids, revisions):
        assert (
            client.get(f"/api/v1/photos/{id}/metadata-effective", headers=headers).json()[
                "revision"
            ]
            == rev
        )


def test_keyword_search_source_parser_and_cursor(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    original_keywords(storage.get_path(photo.storage_key))
    for i in range(4):
        db.add(
            Photo(
                order_id=order.id,
                filename=f"{i}.jpg",
                storage_key=photo.storage_key,
                mime="image/jpeg",
                size_bytes=1,
            )
        )
    db.commit()
    base = f"/api/v1/orders/{order.id}"
    status = client.get(base + "/metadata-keywords/status", headers=headers).json()
    assert status["unknown"] == 5
    rebuild = client.post(base + "/metadata-keywords/rebuild", headers=headers, json={})
    assert rebuild.status_code == 200, rebuild.text
    assert rebuild.json()["coverage"]["complete"]
    url = base + "/photos/catalog"
    params = {"keywords": json.dumps(["人像", "studio"]), "limit": 2}
    with patch.object(service, "read_sources", side_effect=AssertionError("catalog source IO")):
        page = client.get(url, headers=headers, params=params)
        assert page.status_code == 200, page.text
        data = page.json()
        assert len(data["items"]) == 2 and data["has_more"]
        cursor = data["next_cursor"]
        assert (
            client.get(url, headers=headers, params={**params, "cursor": cursor}).status_code == 200
        )
        assert (
            client.get(
                url,
                headers=headers,
                params={**params, "keywords": '["different"]', "cursor": cursor},
            ).status_code
            == 422
        )
        assert client.get(url, headers=headers, params={"cursor": cursor}).status_code == 422
        assert (
            len(
                client.get(url, headers=headers, params={**params, "rating_min": 3}).json()["items"]
            )
            == 0
        )
    assert (
        client.put(
            paths(photo)[1], headers=headers, json=snapshot(keywords={"mode": "clear"})
        ).status_code
        == 200
    )
    assert (
        len(client.get(url, headers=headers, params={**params, "limit": 100}).json()["items"]) == 4
    )
    # Current parser changes make all old projection rows explicitly unknown.
    from app.services import metadata_index

    monkeypatch.setattr(metadata_index, "PARSER_VERSION", "c1-v1.index-next")
    assert client.get(base + "/metadata-keywords/status", headers=headers).json()["unknown"] == 5
    assert client.get(url, headers=headers, params=params).json()["items"] == []
    assert client.post(base + "/metadata-keywords/rebuild", headers=headers, json={}).json()[
        "coverage"
    ]["complete"]


def test_source_change_preserves_overlay_and_rebuild_uses_current_revision(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    get, put = paths(photo)
    first = client.put(
        put, headers=headers, json=snapshot(title={"mode": "override", "value": "我的标题"})
    ).json()
    original_keywords(storage.get_path(photo.storage_key), ["新的来源"])
    changed = client.get(get, headers=headers).json()
    assert changed["source_changed"] and changed["source_sha256"] != first["source_sha256"]
    assert changed["effective"]["title"] == "我的标题" and changed["effective"]["keywords"] == [
        "新的来源"
    ]
    assert "description.source_changed_edits_preserved" in changed["warnings"]
    assert (
        client.post(
            f"/api/v1/photos/{photo.id}/metadata-index", headers=headers, json={}
        ).status_code
        == 200
    )
    # C2 source change excludes a previously derived C4 fingerprint.
    assert (
        client.get(f"/api/v1/orders/{order.id}/metadata-keywords/status", headers=headers).json()[
            "unknown"
        ]
        == 1
    )
    assert client.post(
        f"/api/v1/orders/{order.id}/metadata-keywords/rebuild", headers=headers, json={}
    ).json()["coverage"]["complete"]
    row = db.scalar(select(State))
    assert row.overlay_revision == 1
    storage.delete(photo.storage_key)
    assert client.get(get, headers=headers).status_code == 404
    assert client.put(put, headers=headers, json=snapshot(1)).status_code == 404


def validate_xmp(data):
    # Independent DOM validator, not the serializer's ElementTree helpers.
    from xml.dom import minidom

    doc = minidom.parseString(data)
    dc = "http://purl.org/dc/elements/1.1/"
    rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    assert doc.documentElement.namespaceURI == "adobe:ns:meta/"
    result = {}
    for field, tag, shape in [
        ("title", "title", "Alt"),
        ("caption", "description", "Alt"),
        ("copyright", "rights", "Alt"),
        ("creator", "creator", "Seq"),
        ("keywords", "subject", "Bag"),
    ]:
        nodes = doc.getElementsByTagNameNS(dc, tag)
        assert len(nodes) == 1
        containers = nodes[0].getElementsByTagNameNS(rdf, shape)
        assert len(containers) == 1
        values = []
        for li in containers[0].getElementsByTagNameNS(rdf, "li"):
            if shape == "Alt":
                assert (
                    li.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") == "x-default"
                )
            values.append("".join(c.data for c in li.childNodes if c.nodeType == c.TEXT_NODE))
        result[field] = values if field == "keywords" else values[0] if values else None
    assert len(doc.getElementsByTagNameNS(dc, "*")) == 5
    return result


def test_xmp_roundtrip_whitelist_headers_and_bytes(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    original_keywords(storage.get_path(photo.storage_key))
    path = Path(storage.get_path(photo.storage_key))
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    files_before = set(path.parent.iterdir())
    fields = {
        n: {"mode": "override", "value": '中文 <&> " 📷'}
        for n in ("title", "caption", "creator", "copyright")
    }
    fields["keywords"] = {"mode": "override", "value": ["人像", "A&B", "<rdf:li>恶意</rdf:li>"]}
    saved = client.put(paths(photo)[1], headers=headers, json=snapshot(**fields))
    assert saved.status_code == 200, saved.text
    response = client.get(f"/api/v1/photos/{photo.id}/metadata-sidecar.xmp", headers=headers)
    assert response.status_code == 200
    assert validate_xmp(response.content) == saved.json()["effective"]
    assert response.content == serialize_sidecar(saved.json()["effective"])
    assert response.headers["content-disposition"] == f'attachment; filename="photo-{photo.id}.xmp"'
    assert response.headers["cache-control"].startswith("private, no-store")
    assert all(
        term not in response.content.lower()
        for term in [b"gps", b"makernote", b"serial", b"storage_key"]
    )
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    assert set(path.parent.iterdir()) == files_before


def test_database_constraints_and_delete_cascade(jpeg_case):
    db, users, order, photo, *_ = jpeg_case
    values = dict(
        photo_id=photo.id,
        user_id=users[0].id,
        revision=1,
        source_sha256="a" * 64,
        **{
            n + "_" + p: v
            for n in ("title", "caption", "creator", "copyright", "keywords")
            for p, v in [("mode", "inherit"), ("value", None)]
        },
    )
    for change in [
        {"revision": -1},
        {"title_mode": "unknown"},
        {"title_mode": "clear", "title_value": "invalid"},
        {"title_mode": "override", "title_value": "x" * 513},
        {"source_sha256": "bad"},
        {"keywords_mode": "override", "keywords_value": ["x"] * 65},
        {"keywords_mode": "override", "keywords_value": ["x" * 129]},
        {"keywords_mode": "override", "keywords_value": [None]},
    ]:
        with pytest.raises((IntegrityError, DataError)):
            with db.begin_nested():
                db.add(Overlay(**{**values, **change}))
                db.flush()
    db.add(Overlay(**values))
    db.commit()
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(Overlay(**values))
            db.flush()
    db.delete(photo)
    db.commit()
    assert db.scalar(select(func.count()).select_from(Overlay)) == 0


def test_rebuild_skips_invalid_sources_and_removes_stale_projection(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    original_keywords(path)
    url = f"/api/v1/orders/{order.id}/metadata-keywords/rebuild"
    assert client.post(url, json={}, headers=headers).json()["coverage"]["complete"]
    bad = Photo(
        order_id=order.id,
        filename="bad.jpg",
        storage_key=storage.save("bad.jpg", b"invalid", "image/jpeg"),
        mime="image/jpeg",
        size_bytes=7,
    )
    db.add(bad)
    db.commit()
    path.unlink()
    result = client.post(url, json={}, headers=headers)
    assert result.status_code == 200, result.text
    assert len(result.json()["errors"]) == 2 and result.json()["coverage"]["unknown"] == 2
    assert db.scalar(select(func.count()).select_from(State)) == 0


def test_keyword_combined_sql_filters_and_timeline(client, jpeg_case):
    from datetime import date, datetime, timezone

    from sqlalchemy import event

    from app.core.database import engine
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.services.metadata_index import PARSER_VERSION

    db, users, order, photo, storage, headers = jpeg_case
    original_keywords(storage.get_path(photo.storage_key))
    sha = hashlib.sha256(Path(storage.get_path(photo.storage_key)).read_bytes()).hexdigest()
    db.add(
        Index(
            photo_id=photo.id,
            status="indexed",
            parser_version=PARSER_VERSION,
            source_sha256=sha,
            camera_model="eos 70d",
            capture_date=date(2026, 1, 2),
            capture_timezone_known=False,
            warning_count=0,
            revision=1,
            indexed_at=datetime.now(timezone.utc),
        )
    )
    db.add(
        Annotation(photo_id=photo.id, user_id=users[0].id, rating=4, pick_status="pick", revision=1)
    )
    db.commit()
    base = f"/api/v1/orders/{order.id}"
    assert (
        client.post(base + "/metadata-keywords/rebuild", json={}, headers=headers).status_code
        == 200
    )
    params = {
        "keywords": '["人像"]',
        "rating_min": 3,
        "pick": "pick",
        "camera_model": "eos 70d",
        "captured_from": "2026-01-01",
    }
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        with patch.object(
            service, "read_sources", side_effect=AssertionError("SQL must not parse JPEG")
        ):
            page = client.get(base + "/photos/catalog", params=params, headers=headers)
            assert page.status_code == 200, page.text
            assert [p["id"] for p in page.json()["items"]] == [photo.id]
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(statements) <= 5
    assert (
        client.get(
            base + "/photos/catalog", params={**params, "rating_min": 5}, headers=headers
        ).json()["items"]
        == []
    )
    timeline = client.get(base + "/photos/timeline", params=params, headers=headers)
    assert timeline.status_code == 200, timeline.text
    assert timeline.json()["matched"] == 1


def test_overlay_migration_sqlite_roundtrip(tmp_path, monkeypatch):
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, inspect, text

    from alembic import command
    from app.core.config import settings

    path = tmp_path / "owned-c4-migration.sqlite"
    monkeypatch.setattr(settings, "db_sqlite_path", path.as_posix())
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    engine = create_engine("sqlite:///" + path.as_posix())
    assert "photo_metadata_overlays" in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    command.downgrade(config, "d5f7a9c1e323")
    assert "photo_metadata_overlays" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    assert "photo_metadata_overlays" in inspect(engine).get_table_names()
    engine.dispose()
