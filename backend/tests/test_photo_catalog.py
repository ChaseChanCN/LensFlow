import hashlib
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from threading import Barrier
from unittest.mock import patch

import pytest
from PIL import Image, ImageCms
from sqlalchemy import event, select

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import AppException
from app.core.security import create_access_token
from app.models.photo import Photo
from app.services import thumbnails
from app.services.image_editor import render_slot
from app.services.photo_catalog import encode_cursor
from tests.media_fixtures import SAMPLE


def image_size(content):
    with Image.open(BytesIO(content)) as image:
        assert image.format == "JPEG"
        image.load()
        assert image.getexif().get(274) is None
        profile = ImageCms.ImageCmsProfile(BytesIO(image.info["icc_profile"]))
        assert ImageCms.getProfileName(profile).strip()
        return image.size


@pytest.mark.parametrize("size", [128, 256, 512])
def test_thumbnail_authenticated_cache_and_source_immutable(client, jpeg_case, monkeypatch, size):
    db, users, order, photo, storage, headers = jpeg_case
    original = Path(storage.get_path(photo.storage_key)).read_bytes()
    url = f"/api/v1/photos/{photo.id}/thumbnail?size={size}"
    first = client.get(url, headers=headers)
    assert first.status_code == 200, first.text
    assert (
        first.headers["x-thumbnail-cache"] == "MISS"
        and "no-store" in first.headers["cache-control"]
    )
    width, height = image_size(first.content)
    assert max(width, height) <= size and abs(width / height - 517 / 606) < 0.01
    with patch(
        "app.services.image_editor.decode_jpeg",
        side_effect=AssertionError("must not decode source on hit"),
    ):
        second = client.get(url, headers=headers)
    assert second.status_code == 200 and second.headers["x-thumbnail-cache"] == "HIT"
    assert first.content == second.content
    assert client.get(url).status_code == 401
    for user in users[1:]:
        denied = client.get(
            url, headers={"Authorization": f"Bearer {create_access_token(str(user.id))}"}
        )
        assert denied.status_code == (200 if user.id == order.client_id else 403)
    assert Path(storage.get_path(photo.storage_key)).read_bytes() == original
    # Edited drafts never enter the thumbnail identity.
    draft = {
        "parameters": {
            "schema_version": 2,
            "exposure_ev": 1,
            "geometry": {"rotation_quadrants": 1},
        },
        "expected_revision": 0,
        "expected_source_sha256": hashlib.sha256(original).hexdigest(),
    }
    assert (
        client.put(f"/api/v1/photos/{photo.id}/edit-draft", headers=headers, json=draft).status_code
        == 200
    )
    assert client.get(url, headers=headers).content == first.content


def test_cache_invalidation_corruption_recipe_and_orientation(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/thumbnail"
    baseline = client.get(url, headers=headers)
    cache = thumbnails.cache_root(storage)
    path = next(cache.glob("*.jpg"))
    path.write_bytes(b"incomplete")
    repaired = client.get(url, headers=headers)
    assert repaired.status_code == 200 and repaired.content == baseline.content
    source = Path(storage.get_path(photo.storage_key))
    with Image.open(SAMPLE) as image, BytesIO() as output:
        exif = Image.Exif()
        exif[274] = 6
        image.save(output, "JPEG", exif=exif, icc_profile=thumbnails.stable_profile())
        source.write_bytes(output.getvalue())
    changed = client.get(url, headers=headers)
    assert changed.status_code == 200 and changed.headers["x-thumbnail-cache"] == "MISS"
    width, height = image_size(changed.content)
    assert width > height
    assert len(list(cache.glob("*.jpg"))) == 2
    monkeypatch.setattr(thumbnails, "RECIPE", "test-recipe-v2")
    assert client.get(url, headers=headers).headers["x-thumbnail-cache"] == "MISS"
    assert len(list(cache.glob("*.jpg"))) == 3


def test_thumbnail_failures_limiter_and_atomic_publication(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/thumbnail"
    with render_slot():
        assert client.get(url, headers=headers).status_code == 429
    barrier = Barrier(4)

    def get(_):
        barrier.wait(timeout=5)
        return client.get(url, headers=headers)

    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(get, range(4)))
    assert any(response.status_code == 200 for response in responses)
    for response in responses:
        assert response.status_code in (200, 429)
        if response.status_code == 200:
            image_size(response.content)
    root = thumbnails.cache_root(storage)
    assert len(list(root.glob("*.jpg"))) == 1 and not list(root.glob("*.tmp"))
    path = next(root.glob("*.jpg"))
    path.unlink()
    with patch("app.services.thumbnails.os.replace", side_effect=OSError("disk full")):
        assert client.get(url, headers=headers).status_code == 503
    assert not list(root.iterdir())
    for key in ["../oops", "a/b", "C:drive", "x" * 64]:
        with pytest.raises(AppException):
            thumbnails.cache_entry(root, key)
    assert client.get(url + "?size=999", headers=headers).status_code == 422
    assert client.get(url + "?storage_key=anything", headers=headers).status_code == 422
    monkeypatch.setattr(settings, "storage_type", "obs")
    assert client.get(url, headers=headers).status_code == 503
    monkeypatch.setattr(settings, "storage_type", "local")
    source = Path(storage.get_path(photo.storage_key))
    source.write_bytes(b"invalid")
    assert client.get(url, headers=headers).status_code == 422
    source.write_bytes(SAMPLE.read_bytes())
    monkeypatch.setattr(settings, "image_max_pixels", 1)
    assert client.get(url, headers=headers).status_code == 413
    source.unlink()
    assert client.get(url, headers=headers).status_code == 404


def test_cache_eviction_is_scoped_and_bounded(tmp_path, monkeypatch):
    root = tmp_path / "cache"
    root.mkdir()
    unrelated = root / "user.jpg"
    unrelated.write_bytes(b"keep")
    for i in range(3):
        (root / (str(i) * 64 + ".jpg")).write_bytes(bytes(10))
    monkeypatch.setattr(thumbnails, "MAX_CACHE_BYTES", 25)
    monkeypatch.setattr(thumbnails, "MAX_CACHE_ENTRIES", 2)
    thumbnails.prune_cache(root, 10)
    assert len(list(root.glob("*.jpg"))) == 2 and unrelated.read_bytes() == b"keep"


def test_catalog_keysets_snapshot_order_and_queries(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    db.add_all(
        [
            Photo(
                order_id=order.id,
                filename=f"{i}.jpg",
                storage_key=photo.storage_key,
                mime="image/jpeg",
                size_bytes=photo.size_bytes,
                width=517,
                height=606,
                created_at=photo.created_at,
            )
            for i in range(1005)
        ]
    )
    db.commit()
    order_id = order.id
    statements = []

    def capture(connection, cursor, statement, params, context, many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        first = client.get(f"/api/v1/orders/{order_id}/photos/catalog", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert first.status_code == 200, first.text
    page = first.json()
    assert len(page["items"]) == 50 and page["has_more"]
    assert len(statements) <= 4 and any("LIMIT" in s for s in statements)
    assert "storage_key" not in page["items"][0]
    ids = [row["id"] for row in page["items"]]
    # New rows after this snapshot must not appear halfway through the old chain.
    inserted = Photo(
        order_id=order.id,
        filename="later.jpg",
        storage_key=photo.storage_key,
        size_bytes=photo.size_bytes,
    )
    db.add(inserted)
    db.commit()
    second_id = db.scalar(select(Photo.id).where(Photo.id > ids[-1]).order_by(Photo.id))
    db.query(Photo).filter(Photo.id == second_id).delete()
    db.commit()
    while page["has_more"]:
        page = client.get(
            f"/api/v1/orders/{order.id}/photos/catalog",
            headers=headers,
            params={"cursor": page["next_cursor"], "limit": 100},
        ).json()
        ids.extend(item["id"] for item in page["items"])
    assert (
        len(ids) == 1005
        and ids == sorted(set(ids))
        and inserted.id not in ids
        and second_id not in ids
    )
    assert page["next_cursor"] is None
    plan = (
        db.connection()
        .exec_driver_sql(
            "EXPLAIN QUERY PLAN SELECT id FROM photos "
            "WHERE order_id=? AND id>? ORDER BY id LIMIT 51",
            (order.id, 0),
        )
        .fetchall()
    )
    assert any("ix_photos_order_id" in row[-1] for row in plan) and not any(
        "TEMP B-TREE" in row[-1] for row in plan
    )
    assert len(client.get(f"/api/v1/orders/{order.id}/photos", headers=headers).json()) == 1006


def test_catalog_permissions_invalid_cursors_empty_and_asset(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/orders/{order.id}/photos/catalog"
    assert client.get(url).status_code == 401
    for user in users[1:]:
        assert client.get(
            url, headers={"Authorization": f"Bearer {create_access_token(str(user.id))}"}
        ).status_code == (200 if user.id == order.client_id else 403)
    for params in [
        {"limit": 0},
        {"limit": 101},
        {"cursor": "broken"},
        {"cursor": ""},
        {"cursor": encode_cursor(order.id + 1, users[0].id, 1, 9)},
        {"cursor": encode_cursor(order.id, 999, 1, 9)},
        {"unknown": "x"},
    ]:
        assert client.get(url, headers=headers, params=params).status_code == 422
    asset = client.get(f"/api/v1/orders/{order.id}/photos/{photo.id}/asset", headers=headers)
    assert asset.status_code == 200 and "storage_key" not in asset.json()
    assert (
        client.get(f"/api/v1/orders/999/photos/{photo.id}/asset", headers=headers).status_code
        == 404
    )
    db.delete(photo)
    db.commit()
    empty = client.get(url, headers=headers).json()
    assert empty == {"items": [], "next_cursor": None, "has_more": False}
    assert (
        client.get(
            f"/api/v1/orders/{order.id}/photos/{photo.id}/asset", headers=headers
        ).status_code
        == 404
    )
