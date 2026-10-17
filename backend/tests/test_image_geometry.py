import hashlib
from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageOps

from app.schemas.image_edit import EditParametersV2, GeometryParameters
from app.services.image_editor import apply_edits, decode_jpeg, encode_jpeg
from app.services.image_geometry import geometry_image
from tests.media_fixtures import SAMPLE


@pytest.mark.parametrize("q", [0, 1, 2, 3])
@pytest.mark.parametrize(
    "horizontal,vertical", [(False, False), (True, False), (False, True), (True, True)]
)
def test_integer_transposes_exact(q, horizontal, vertical):
    a = np.arange(7 * 5 * 3, dtype=np.uint8).reshape((5, 7, 3))
    with Image.fromarray(a) as source:
        g = GeometryParameters(
            rotation_quadrants=q, flip_horizontal=horizontal, flip_vertical=vertical
        )
        expected = np.rot90(a, -q)
        if horizontal:
            expected = np.flip(expected, 1)
        if vertical:
            expected = np.flip(expected, 0)
        with geometry_image(source, g) as result:
            assert np.array_equal(np.asarray(result), expected)
        assert np.array_equal(np.asarray(source), a)


def test_v2_default_equals_v1_and_preview_metadata(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}"
    v1 = client.post(url + "/export", headers=headers, json={"edit": {"schema_version": 1}})
    v2 = client.post(url + "/export", headers=headers, json={"edit": {"schema_version": 2}})
    assert v1.status_code == v2.status_code == 200
    assert v1.content == v2.content
    preview = client.get(url + "/preview?max_side=128", headers=headers)
    assert (
        preview.headers["x-source-width"] == "517" and preview.headers["x-source-height"] == "606"
    )
    with Image.open(BytesIO(preview.content)) as image:
        assert max(image.size) == 128


@pytest.mark.parametrize("max_side", [None, 1024, 127, 31])
def test_geometry_color_matches_full_size_region_before_downsampling(client, jpeg_case, max_side):
    db, users, order, photo, storage, headers = jpeg_case
    edit = {
        "schema_version": 2,
        "exposure_ev": 0.7,
        "contrast": 25,
        "saturation": -30,
        "geometry": {
            "rotation_quadrants": 1,
            "flip_horizontal": True,
            "flip_vertical": False,
            "crop": {"x": 0.13, "y": 0.17, "width": 0.72, "height": 0.61},
        },
    }
    path = Path(storage.get_path(photo.storage_key))
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    mode = "export" if max_side is None else f"preview?max_side={max_side}"
    response = client.post(
        f"/api/v1/photos/{photo.id}/{mode}", headers=headers, json={"edit": edit}
    )
    assert response.status_code == 200, response.text
    # Independently use Pillow primitives and explicit expected full-resolution edges.
    with (
        decode_jpeg(SAMPLE.read_bytes()) as source,
        source.transpose(Image.Transpose.ROTATE_270) as rotated,
        ImageOps.mirror(rotated) as flipped,
    ):
        # floor(606*.13), floor(517*.17), ceil(606*.85), ceil(517*.78)
        with flipped.crop((78, 87, 516, 404)) as cropped:
            if max_side:
                cropped.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            apply_edits(cropped, EditParametersV2(**edit))
            assert response.content == encode_jpeg(cropped)
            assert (
                int(response.headers["x-image-width"]),
                int(response.headers["x-image-height"]),
            ) == cropped.size
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    db.refresh(photo)
    assert photo.storage_key == path.name
    with Image.open(BytesIO(response.content)) as output:
        assert output.getexif().get(274) is None and output.info.get("icc_profile")


def test_exif_applied_once_then_user_rotation(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    # Test-only oriented copy of the actual photograph, never changes development files.
    with Image.open(SAMPLE) as source, BytesIO() as buffer:
        exif = Image.Exif()
        exif[274] = 6
        source.save(buffer, "JPEG", exif=exif)
        data = buffer.getvalue()
    path.write_bytes(data)
    response = client.post(
        f"/api/v1/photos/{photo.id}/export",
        headers=headers,
        json={"edit": {"schema_version": 2, "geometry": {"rotation_quadrants": 1}}},
    )
    assert response.status_code == 200
    with (
        Image.open(BytesIO(data)) as source,
        source.transpose(Image.Transpose.ROTATE_180) as expected,
    ):
        assert response.content == encode_jpeg(expected)
    assert path.read_bytes() == data


def test_v1_draft_is_not_rewritten_until_actual_v2_save(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/edit-draft"
    state = client.get(url, headers=headers).json()
    old = {"schema_version": 1, "exposure_ev": 0.7, "contrast": 25, "saturation": -30}
    request = {
        "parameters": old,
        "expected_revision": 0,
        "expected_source_sha256": state["source_sha256"],
    }
    assert client.put(url, headers=headers, json=request).status_code == 200
    for _ in range(2):
        remote = client.get(url, headers=headers).json()
        assert remote["parameters"] == old and remote["revision"] == 1
    upgraded = {
        **old,
        "schema_version": 2,
        "geometry": {
            "rotation_quadrants": 1,
            "flip_horizontal": False,
            "flip_vertical": False,
            "crop": None,
        },
    }
    request.update(parameters=upgraded, expected_revision=1)
    assert client.put(url, headers=headers, json=request).json()["revision"] == 2
    stale = client.put(url, headers=headers, json=request)
    assert stale.status_code == 409
    assert client.get(url, headers=headers).json()["parameters"] == upgraded


@pytest.mark.parametrize("width,height", [(1, 1), (3, 2), (16, 9), (7, 5)])
def test_crop_integer_pixel_regions(width, height):
    source_array = np.arange(11 * 19 * 3, dtype=np.uint8).reshape((11, 19, 3))
    geometry = GeometryParameters(crop={"x": 0, "y": 0, "width": width / 19, "height": height / 11})
    with Image.fromarray(source_array) as source, geometry_image(source, geometry) as result:
        assert result.size == (width, height)
        assert np.array_equal(np.asarray(result), source_array[:height, :width])


def test_v2_invalid_crop_and_permissions_reuse_existing_guards(client, jpeg_case):
    from app.core.security import create_access_token

    db, users, order, photo, storage, headers = jpeg_case
    edit = {"schema_version": 2, "geometry": {"crop": {"x": 0, "y": 0, "width": 0, "height": 1}}}
    for action in ["preview", "export"]:
        url = f"/api/v1/photos/{photo.id}/{action}"
        assert client.post(url, json={"edit": edit}).status_code == 401
        other = {"Authorization": f"Bearer {create_access_token(str(users[1].id))}"}
        assert (
            client.post(url, headers=other, json={"edit": {"schema_version": 2}}).status_code == 403
        )
        assert client.post(url, headers=headers, json={"edit": edit}).status_code == 422
        raw = (
            '{"edit":{"schema_version":2,"geometry":{"crop":{"x":NaN,"y":0,"width":1,"height":1}}}}'
        )
        response = client.post(
            url, headers={**headers, "Content-Type": "application/json"}, content=raw
        )
        assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"
