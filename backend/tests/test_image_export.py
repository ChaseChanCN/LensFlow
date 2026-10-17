import asyncio
import hashlib
import threading
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import pytest
from PIL import Image, ImageOps

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.main import app
from app.models.photo import Photo
from app.schemas.image_edit import EditParameters
from app.services.image_editor import apply_edits, decode_jpeg, encode_jpeg, render_slot
from tests.media_fixtures import SAMPLE
from tests.test_photos import auth_headers, setup_order_at_waiting_upload


def pixels(content):
    with Image.open(BytesIO(content)) as image:
        return np.asarray(image.convert("RGB")).copy()


def test_zero_export_and_source_hash(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    old_key = photo.storage_key
    result = client.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json={})
    assert result.status_code == 200, result.text
    with decode_jpeg(SAMPLE.read_bytes()) as normalized:
        expected = encode_jpeg(normalized)
    assert np.array_equal(pixels(result.content), pixels(expected))
    assert result.headers["x-source-sha256"] == before
    assert "attachment" in result.headers["content-disposition"]
    assert "no-store" in result.headers["cache-control"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    db.refresh(photo)
    assert photo.storage_key == old_key
    assert list(Path(storage.base_path).iterdir()) == [path]


@pytest.mark.parametrize("edit", [{"exposure_ev": 1}, {"contrast": 60}, {"saturation": -100}])
def test_each_control_changes_real_pixels(client, jpeg_case, edit):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/export"
    baseline = client.post(url, headers=headers, json={})
    changed = client.post(url, headers=headers, json={"edit": edit})
    assert changed.status_code == 200, changed.text
    a, b = pixels(baseline.content), pixels(changed.content)
    assert a.shape == b.shape == (606, 517, 3)
    assert np.mean(np.abs(a.astype(float) - b)) > 1
    if "exposure_ev" in edit:
        assert b.mean() > a.mean()
    if "saturation" in edit:
        assert np.max(np.abs(b[:, :, 0].astype(int) - b[:, :, 2])) <= 2


@pytest.mark.parametrize(
    "edit",
    [
        {"exposure_ev": -2.01},
        {"exposure_ev": 2.01},
        {"contrast": -101},
        {"contrast": 101},
        {"saturation": -101},
        {"saturation": 101},
        {"exposure_ev": "1"},
        {"contrast": True},
        {"saturation": None},
        {"schema_version": 3},
        {"schema_version": True},
        {"schema_version": "1"},
        {"unknown": 0},
        {"exposure_ev": []},
    ],
)
def test_invalid_parameters(client, jpeg_case, edit):
    db, users, order, photo, storage, headers = jpeg_case
    response = client.post(
        f"/api/v1/photos/{photo.id}/export", headers=headers, json={"edit": edit}
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
@pytest.mark.parametrize("field", ["exposure_ev", "contrast", "saturation"])
def test_nonfinite_input_returns_validation_not_500(client, jpeg_case, value, field):
    db, users, order, photo, storage, headers = jpeg_case
    response = client.post(
        f"/api/v1/photos/{photo.id}/export",
        headers={**headers, "Content-Type": "application/json"},
        content='{"edit":{"' + field + '":' + value + "}}",
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_export_auth_and_arbitrary_storage_key(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/export"
    assert client.post(url, json={}).status_code == 401
    for user in users[1:]:
        token = {"Authorization": f"Bearer {create_access_token(str(user.id))}"}
        assert client.post(url, headers=token, json={}).status_code == 403
    assert client.post("/api/v1/photos/9999/export", headers=headers, json={}).status_code == 404
    for field in ("storage_key", "path", "order_id"):
        assert client.post(url, headers=headers, json={field: "../outside.jpg"}).status_code == 422


def test_edited_preview_shares_contract(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    body = {"edit": {"schema_version": 1, "exposure_ev": 0.5, "contrast": 20, "saturation": -10}}
    preview = client.post(f"/api/v1/photos/{photo.id}/preview", headers=headers, json=body)
    export = client.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json=body)
    assert preview.status_code == export.status_code == 200
    assert np.array_equal(pixels(preview.content), pixels(export.content))


def test_different_photos_and_requests_do_not_leak_state(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    with Image.open(SAMPLE) as source, ImageOps.mirror(source) as mirrored, BytesIO() as output:
        mirrored.save(output, "JPEG")
        second_bytes = output.getvalue()
    second_key = storage.save("second.jpg", second_bytes)
    second = Photo(
        order_id=order.id,
        storage_key=second_key,
        filename="second.jpg",
        mime="image/jpeg",
        size_bytes=len(second_bytes),
    )
    db.add(second)
    db.commit()
    second_id = second.id
    url = f"/api/v1/photos/{second_id}/export"
    before = client.post(url, headers=headers, json={}).content
    changed = client.post(
        f"/api/v1/photos/{photo.id}/export",
        headers=headers,
        json={"edit": {"exposure_ev": 2, "contrast": -100}},
    )
    assert changed.status_code == 200
    after = client.post(url, headers=headers, json={}).content
    assert np.array_equal(pixels(before), pixels(after))
    assert Path(storage.get_path(second_key)).read_bytes() == second_bytes


def test_export_orientation_and_invalid_file(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    with Image.open(SAMPLE) as source, BytesIO() as output:
        exif = Image.Exif()
        exif[274] = 6
        source.save(output, "JPEG", exif=exif)
        path.write_bytes(output.getvalue())
    url = f"/api/v1/photos/{photo.id}/export"
    response = client.post(url, headers=headers, json={"edit": {"exposure_ev": 0.3}})
    assert response.status_code == 200
    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (606, 517)
        assert not image.getexif()
    path.write_bytes(b"invalid")
    assert client.post(url, headers=headers, json={}).status_code == 422


def test_invalid_icc_and_truncated_data(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    with Image.open(SAMPLE) as source, BytesIO() as output:
        source.save(output, "JPEG", icc_profile=b"not an ICC profile")
        path.write_bytes(output.getvalue())
    url = f"/api/v1/photos/{photo.id}/preview"
    assert client.get(url, headers=headers).status_code == 422
    path.write_bytes(SAMPLE.read_bytes()[:2000])
    assert client.get(url, headers=headers).status_code == 422


def test_capacity_fails_honestly_and_recovers(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/export"
    with render_slot():
        assert client.post(url, headers=headers, json={}).status_code == 429
    assert client.post(url, headers=headers, json={}).status_code == 200


@pytest.mark.asyncio
async def test_cpu_work_does_not_block_async_health(jpeg_case, monkeypatch):
    from app.api.v1 import image_edit

    db, users, order, photo, storage, headers = jpeg_case
    entered, release = threading.Event(), threading.Event()
    original = image_edit.edited_jpeg

    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(image_edit, "edited_jpeg", blocked)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as ac:
        pending = asyncio.create_task(
            ac.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json={})
        )
        try:
            assert await asyncio.to_thread(entered.wait, 3)
            health = await asyncio.wait_for(ac.get("/health"), timeout=1)
            assert health.status_code == 200
        finally:
            release.set()
            result = await pending
        assert result.status_code == 200


def test_real_jpeg_full_http_workflow(client):
    photographer, _, order_id = setup_order_at_waiting_upload(client)
    headers = auth_headers(photographer)
    # Token obtained via the real login endpoint as well as registration.
    login = client.post(
        "/api/v1/auth/login", json={"email": "p@test.com", "password": "password123"}
    )
    assert login.status_code == 200
    headers = auth_headers(login.json()["access_token"])
    response = client.post(
        f"/api/v1/orders/{order_id}/photos",
        headers=headers,
        files={"file": ("grace_hopper.jpg", SAMPLE.read_bytes(), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    photo_id = response.json()["photo"]["id"]
    with SessionLocal() as db:
        photo = db.get(Photo, photo_id)
        key = photo.storage_key
    from app.services.storage import LocalStorage

    path = Path(LocalStorage().get_path(key))
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    preview = client.get(f"/api/v1/photos/{photo_id}/preview", headers=headers)
    exported = client.post(
        f"/api/v1/photos/{photo_id}/export",
        headers=headers,
        json={"edit": {"schema_version": 1, "exposure_ev": 0.7, "contrast": 25, "saturation": -30}},
    )
    assert preview.status_code == exported.status_code == 200
    assert pixels(exported.content).shape == (606, 517, 3)
    assert np.abs(pixels(exported.content).astype(float) - pixels(preview.content)).mean() > 1
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source_hash
    assert exported.headers["x-source-sha256"] == source_hash
    with SessionLocal() as db:
        assert db.get(Photo, photo_id).storage_key == key
    assert list(path.parent.iterdir()) == [path]


def test_upload_rejects_corrupt_before_persisting(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    count = db.query(Photo).count()
    existing_files = list(Path(storage.base_path).iterdir())
    response = client.post(
        f"/api/v1/orders/{order.id}/photos",
        headers=headers,
        files={"file": ("forged.jpg", b"not a JPEG", "image/jpeg")},
    )
    assert response.status_code == 422
    assert db.query(Photo).count() == count
    assert list(Path(storage.base_path).iterdir()) == existing_files


def test_algorithm_boundaries_and_stripes():
    with decode_jpeg(SAMPLE.read_bytes()) as image:
        apply_edits(image, EditParameters(exposure_ev=-2, contrast=100, saturation=100))
        assert image.size == (517, 606)
        assert np.asarray(image).dtype == np.uint8


@pytest.mark.parametrize("field", ["image_max_bytes", "image_max_pixels", "image_max_dimension"])
def test_export_limits(client, jpeg_case, monkeypatch, field):
    from app.core.config import settings

    db, users, order, photo, storage, headers = jpeg_case
    monkeypatch.setattr(settings, field, 100)
    response = client.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json={})
    assert response.status_code == 413


def test_valid_srgb_profile_survives_as_srgb(client, jpeg_case):
    from app.services.image_editor import srgb_profile

    db, users, order, photo, storage, headers = jpeg_case
    with Image.open(SAMPLE) as source, BytesIO() as output:
        source.save(output, "JPEG", icc_profile=srgb_profile())
        Path(storage.get_path(photo.storage_key)).write_bytes(output.getvalue())
    response = client.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json={})
    assert response.status_code == 200
    with Image.open(BytesIO(response.content)) as image:
        from PIL import ImageCms

        profile = ImageCms.ImageCmsProfile(BytesIO(image.info["icc_profile"]))
        assert "sRGB" in ImageCms.getProfileDescription(profile)


def test_normalized_zero_export_is_close_to_actual_photograph(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    response = client.post(f"/api/v1/photos/{photo.id}/export", headers=headers, json={})
    assert response.status_code == 200
    source, exported = (
        pixels(SAMPLE.read_bytes()).astype(float),
        pixels(response.content).astype(float),
    )
    rmse = np.sqrt(np.mean((source - exported) ** 2))
    assert rmse < 3, rmse
