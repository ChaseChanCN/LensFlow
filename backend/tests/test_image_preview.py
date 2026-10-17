from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings
from app.core.security import create_access_token
from app.services.storage import Storage
from tests.media_fixtures import SAMPLE


def test_real_preview(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    response = client.get(f"/api/v1/photos/{photo.id}/preview?max_side=256", headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/jpeg"
    assert "no-store" in response.headers["cache-control"]
    assert "Authorization" in response.headers["vary"]
    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (218, 256)
        assert image.getexif().get(274) is None
        assert image.info.get("icc_profile")
    assert Path(storage.get_path(photo.storage_key)).read_bytes() == SAMPLE.read_bytes()


def test_preview_auth_and_ownership(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/preview"
    assert client.get(url).status_code == 401
    for user in (users[1], users[3], users[4]):
        other = {"Authorization": f"Bearer {create_access_token(str(user.id))}"}
        assert client.get(url, headers=other).status_code == 403
    owner_client = {"Authorization": f"Bearer {create_access_token(str(users[2].id))}"}
    assert client.get(url, headers=owner_client).status_code == 200
    assert client.get("/api/v1/photos/9999/preview", headers=headers).status_code == 404
    assert client.get(url + "?max_side=1025", headers=headers).status_code == 422


@pytest.mark.parametrize("content,status", [(b"broken jpeg", 422), (b"\xff\xd8\xff\xe0bad", 422)])
def test_invalid_jpeg(client, jpeg_case, content, status):
    db, users, order, photo, storage, headers = jpeg_case
    Path(storage.get_path(photo.storage_key)).write_bytes(content)
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == status


def test_png_with_jpeg_name_rejected(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    with Image.open(SAMPLE) as image, BytesIO() as output:
        image.save(output, "PNG")
        Path(storage.get_path(photo.storage_key)).write_bytes(output.getvalue())
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == 415


@pytest.mark.parametrize("limit", ["image_max_bytes", "image_max_pixels", "image_max_dimension"])
def test_limits_before_decode(client, jpeg_case, monkeypatch, limit):
    db, users, order, photo, storage, headers = jpeg_case
    monkeypatch.setattr(settings, limit, 100)
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == 413


def test_orientation_and_metadata(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    with Image.open(SAMPLE) as image, BytesIO() as output:
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "private comment"
        image.save(output, "JPEG", exif=exif)
        Path(storage.get_path(photo.storage_key)).write_bytes(output.getvalue())
    response = client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers)
    assert response.status_code == 200
    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (606, 517)
        assert not image.getexif()


def test_missing_file_and_path_escape(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    photo.storage_key = "../outside.jpg"
    db.commit()
    url = f"/api/v1/photos/{photo.id}/preview"
    assert client.get(url, headers=headers).status_code == 422
    photo.storage_key = "missing.jpg"
    db.commit()
    assert client.get(url, headers=headers).status_code == 404


def test_backend_without_read_fails_closed(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    # Default compatibility method never fetches a public storage URL.
    monkeypatch.setattr(type(storage), "open_read", Storage.open_read)
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == 503


def test_preview_large_real_photo_stays_within_1024(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    with Image.open(SAMPLE) as image, image.resize((1551, 1818)) as large, BytesIO() as output:
        large.save(output, "JPEG")
        Path(storage.get_path(photo.storage_key)).write_bytes(output.getvalue())
    response = client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers)
    assert response.status_code == 200
    with Image.open(BytesIO(response.content)) as result:
        assert result.size == (874, 1024)
    assert (
        client.get(
            f"/api/v1/photos/{photo.id}/preview?storage_key=outside.jpg", headers=headers
        ).status_code
        == 422
    )


def test_pixel_limit_rejected_before_load(client, jpeg_case, monkeypatch):
    from PIL import JpegImagePlugin

    db, users, order, photo, storage, headers = jpeg_case
    monkeypatch.setattr(settings, "image_max_pixels", 1)

    def forbidden_load(*args, **kwargs):
        pytest.fail("Pixel decoder must not run over the configured limit")

    monkeypatch.setattr(JpegImagePlugin.JpegImageFile, "load", forbidden_load)
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == 413
