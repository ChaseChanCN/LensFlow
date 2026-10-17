import hashlib
import json
import struct
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image
from sqlalchemy import text

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import create_access_token
from app.services import photo_metadata as service
from app.services.image_editor import srgb_profile
from app.services.metadata_segments import MAX_METADATA, MAX_XML
from tests.media_fixtures import SAMPLE
from tests.metadata_samples import (
    XMP_HEADER,
    common_exif,
    exif_segment,
    inject,
    iptc_segment,
    segment,
    xmp_segment,
)


def parse(*segments):
    return service.normalize_metadata(1, inject(*segments))


@pytest.mark.parametrize("make,endian", [("Canon", "<"), ("Nikon", ">"), ("SONY", "<")])
def test_constructed_manufacturer_exif_matches_independent_pillow(make, endian):
    data = inject(common_exif(make, endian=endian))
    result = service.normalize_metadata(1, data)
    with Image.open(BytesIO(data)) as photo:
        independently_read = photo.getexif()
        assert independently_read[271] == result.camera.make == make
        actual = independently_read.get_ifd(34665)
        assert float(actual[33434]) == result.capture.exposure_seconds == 0.008
        assert float(actual[33437]) == result.capture.f_number == 2.8
        assert actual[34855] == result.capture.iso == 400
        assert independently_read[274] == result.capture.orientation == 6
    assert result.capture.date_time_original == "2026-10-17T14:32:18.123456789+08:00"
    assert result.capture.timezone_known
    assert result.capture.flash_fired is True
    assert result.camera.serial_number == "PRIVATE-SERIAL"
    assert result.description.creator == "摄影师"
    assert result.gps.latitude == 30.25 and result.gps.longitude == 120.5
    assert result.gps.altitude_m == -10
    assert (result.image.width, result.image.height) == (517, 606)
    assert (result.image.oriented_width, result.image.oriented_height) == (606, 517)
    assert result.image.color_space == "sRGB"
    assert not result.warnings


def test_real_fixture_without_exif_needs_no_pixel_decode():
    with patch.object(Image.Image, "load", side_effect=AssertionError("pixel decode")):
        value = service.normalize_metadata(1, SAMPLE.read_bytes())
    assert value.camera.model is None and value.capture.iso is None and value.gps is None
    assert value.capture.date_candidates == []
    assert value.source_sha256 == hashlib.sha256(SAMPLE.read_bytes()).hexdigest()


def test_partial_exif_unknown_lens_and_missing_timezone():
    value = parse(exif_segment([(271, 2, "Unknown")], [(36867, 2, "2026:10:17 14:32:18")]))
    assert value.camera.lens_model is None
    assert value.capture.date_time_original == "2026-10-17T14:32:18"
    assert not value.capture.timezone_known


@pytest.mark.parametrize("offset", ["bad", "+25:00", "+08:99", "+14:01"])
def test_invalid_offset_keeps_unknown_not_guessed(offset):
    value = parse(common_exif(offset=offset))
    assert not value.capture.timezone_known
    assert value.capture.date_time_original == "2026-10-17T14:32:18.123456789"
    assert "exif.invalid_offset_time" in value.warnings


@pytest.mark.parametrize(
    "tag,kind,value",
    [(33434, 5, [(1, 0)]), (33434, 2, "shutter"), (33434, 5, [(0, 1)]), (34855, 3, 0)],
)
def test_invalid_numeric_fields_not_fabricated(tag, kind, value):
    result = parse(exif_segment(exif=[(tag, kind, value)]))
    assert result.capture.exposure_seconds is None and result.capture.iso is None
    assert result.warnings


def test_duplicates_long_text_controls_corrupt_exif_and_makernote():
    value = parse(
        exif_segment(
            [(271, 2, "A\x01B"), (271, 2, "C"), (272, 2, "Z" * 2000), (274, 3, 9)],
            [(37500, 2, "opaque" * 8000)],
        )
    )
    assert value.camera.make == "AB" and len(value.camera.model) == 1024
    assert value.capture.orientation is None
    assert {"exif.duplicate_tag", "text.controls_removed", "text.truncated"} <= set(value.warnings)
    assert "opaque" not in value.model_dump_json()
    broken = parse(segment(0xE1, b"Exif\0\0bad"))
    assert "exif.invalid_packet" in broken.warnings


def test_invalid_tiff_pointer_and_tag_count():
    value = parse(segment(0xE1, b"Exif\0\0II*\0\xff\xff\xff\x7f"))
    assert "exif.invalid_packet" in value.warnings
    with pytest.raises(AppException) as error:
        parse(segment(0xE1, b"Exif\0\0II*\0\x08\0\0\0" + struct.pack("<H", 257)))
    assert error.value.status_code == 413


def test_iptc_unicode_repeated_keywords_and_editorial_date():
    value = parse(
        iptc_segment(
            [
                (5, "中文标题"),
                (120, "真实照片说明"),
                (80, "摄影师"),
                (116, "© 版权"),
                (25, "旅行"),
                (25, "旅行"),
                (25, "摄影"),
                (55, "20261017"),
                (60, "143218+0800"),
            ]
        )
    )
    assert value.description.title == "中文标题"
    assert value.description.keywords == ["旅行", "摄影"]
    assert value.description.creator == "摄影师"
    assert value.capture.date_time_original is None  # Editorial date is not EXIF capture time.
    assert value.capture.date_candidates[0].value == "2026-10-17T14:32:18+08:00"


def test_xmp_multilingual_precedence_provenance_and_ambiguity():
    xmp = xmp_segment(
        '<dc:title><rdf:Alt><rdf:li xml:lang="zh-CN">中文标题</rdf:li>'
        '<rdf:li xml:lang="x-default">Default</rdf:li></rdf:Alt></dc:title>'
        "<dc:description>Caption</dc:description><dc:creator><rdf:Seq><rdf:li>作者</rdf:li></rdf:Seq></dc:creator>"
        "<dc:rights>Rights</dc:rights><dc:subject><rdf:Bag><rdf:li>keyword</rdf:li></rdf:Bag></dc:subject>"
        "<photoshop:DateCreated>2020-01-02</photoshop:DateCreated>"
        "<xmp:CreateDate>2021-01-02T03:04:05Z</xmp:CreateDate>"
    )
    value = parse(common_exif(), iptc_segment([(5, "IPTC title"), (25, "IPTC word")]), xmp)
    assert value.description.title == "Default"
    assert value.description.localized["title"]["zh-CN"] == "中文标题"
    assert value.description.creator == "作者"
    assert value.description.keywords == ["keyword"]
    assert value.provenance["description.title"] == "xmp"
    assert "description.title.conflict" in value.warnings
    assert "capture.date_ambiguity" in value.warnings
    assert len(value.capture.date_candidates) == 3


def test_xmp_language_selection_deterministic_without_default():
    value = parse(
        xmp_segment(
            '<dc:title><rdf:Alt><rdf:li xml:lang="zh-CN">中</rdf:li>'
            '<rdf:li xml:lang="en-US">English</rdf:li></rdf:Alt></dc:title>'
        )
    )
    assert value.description.title == "English"
    assert "xmp.language_fallback" in value.warnings


def test_xmp_compact_attributes_and_gps():
    xml = (
        b'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        b'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/">'
        b'<rdf:Description dc:title="Compact" exif:GPSLatitude="30,15N" '
        b'exif:GPSLongitude="120.5"/></rdf:RDF>'
    )
    value = parse(segment(0xE1, XMP_HEADER + xml))
    assert value.description.title == "Compact" and value.gps.latitude == 30.25
    assert value.provenance["gps"] == "xmp"


@pytest.mark.parametrize(
    "xml",
    [
        b"<broken",
        b'<!DOCTYPE x [<!ENTITY a SYSTEM "file:///secret">]><x>&a;</x>',
        b'<!DOCTYPE x SYSTEM "https://example.invalid/private"><x/>',
        '<!DOCTYPE x [<!ENTITY a "abc">]><x>&a;</x>'.encode("utf-16"),
    ],
)
def test_malformed_unsafe_xmp_warns_without_raw_or_network(xml):
    value = parse(segment(0xE1, XMP_HEADER + xml))
    assert "xmp.invalid_or_unsafe_packet" in value.warnings
    assert value.description.title is None
    assert "secret" not in value.model_dump_json()


@pytest.mark.parametrize(
    "xml",
    [b"x" * (MAX_XML + 1), b"<x>" * 17 + b"</x>" * 17, b"<x>" + b"<a/>" * 2048 + b"</x>"],
    ids=["packet", "depth", "nodes"],
)
def test_xml_bounds(xml):
    with pytest.raises(AppException) as error:
        parse(segment(0xE1, XMP_HEADER + xml))
    assert error.value.status_code == 413


def test_aggregate_metadata_and_segment_limits():
    with pytest.raises(AppException) as error:
        parse(*[segment(0xEF, b"x" * 65533)] * (MAX_METADATA // 65533 + 1))
    assert error.value.status_code == 413
    with pytest.raises(AppException):
        parse(*[segment(0xFE, b"")] * 4097)


@pytest.mark.parametrize(
    "data",
    [b"not JPEG", b"\xff\xd8\xff\xd9", SAMPLE.read_bytes()[:-2], b"\xff\xd8\xff\xe1\xff\xfftiny"],
    ids=["text", "no-frame", "truncated", "bad-length"],
)
def test_invalid_jpeg(data):
    with pytest.raises(AppException) as error:
        service.normalize_metadata(1, data)
    assert error.value.status_code == 422


def test_image_size_and_byte_limits(monkeypatch):
    monkeypatch.setattr(settings, "image_max_pixels", 20)
    with pytest.raises(AppException) as error:
        parse()
    assert error.value.status_code == 413
    monkeypatch.setattr(settings, "image_max_bytes", 10)
    with pytest.raises(AppException) as error:
        parse()
    assert error.value.status_code == 413


def test_icc_identity_and_invalid_profile():
    profile = srgb_profile()
    value = parse(segment(0xE2, b"ICC_PROFILE\0\x01\x01" + profile))
    assert "sRGB" in value.image.icc_profile_name
    assert value.image.icc_profile_sha256 == hashlib.sha256(profile).hexdigest()
    assert "icc.invalid_profile" in parse(segment(0xE2, b"ICC_PROFILE\0\x01\x01bad")).warnings


def dump_database(db):
    return {
        name: [tuple(row) for row in db.execute(text(f'SELECT * FROM "{name}"')).all()]
        for (name,) in db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        ).all()
    }


def test_endpoint_authorized_private_immutable_and_preview_export(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    path.write_bytes(inject(common_exif()))
    before = path.read_bytes()
    database_before = dump_database(db)
    response = client.get(f"/api/v1/photos/{photo.id}/metadata", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["source_sha256"] == hashlib.sha256(before).hexdigest()
    assert body["camera"]["make"] == "Canon" and body["gps"]["latitude"] == 30.25
    assert (
        "no-store" in response.headers["cache-control"]
        and "Authorization" in response.headers["vary"]
    )
    assert all(
        word not in json.dumps(body)
        for word in ["storage_key", "MakerNote", "raw_tags", "password"]
    )
    assert client.get(f"/api/v1/photos/{photo.id}/preview", headers=headers).status_code == 200
    assert (
        client.post(
            f"/api/v1/photos/{photo.id}/export", headers=headers, json={"edit": {}}
        ).status_code
        == 200
    )
    assert path.read_bytes() == before
    assert dump_database(db) == database_before


@pytest.mark.parametrize("index", [1, 2, 3, 4])
def test_endpoint_denies_other_photographer_clients_admin_before_storage(client, jpeg_case, index):
    db, users, order, photo, storage, headers = jpeg_case
    headers = {"Authorization": "Bearer " + create_access_token(str(users[index].id))}
    with patch.object(service, "get_storage", side_effect=AssertionError("unauthorized read")):
        response = client.get(f"/api/v1/photos/{photo.id}/metadata", headers=headers)
    assert response.status_code == 403 and "no-store" in response.headers["cache-control"]
    assert "latitude" not in response.text and "PRIVATE-SERIAL" not in response.text


def test_endpoint_auth_missing_file_bad_query_and_obs(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    path = f"/api/v1/photos/{photo.id}/metadata"
    assert client.get(path).status_code == 401
    assert client.get("/api/v1/photos/999/metadata", headers=headers).status_code == 404
    assert client.get(path + "?storage_key=secret", headers=headers).status_code == 422
    assert client.get("/api/v1/photos/nope/metadata", headers=headers).status_code == 422
    monkeypatch.setattr(settings, "storage_type", "obs")
    assert client.get(path, headers=headers).status_code == 503
    monkeypatch.setattr(settings, "storage_type", "local")
    storage.delete(photo.storage_key)
    assert client.get(path, headers=headers).status_code == 404


def test_metadata_busy_slots_released():
    with service.metadata_slot(), service.metadata_slot():
        with pytest.raises(AppException) as error:
            service.read_photo_metadata(1, "unused")
        assert error.value.status_code == 429
    with service.metadata_slot():
        pass


def test_source_change_no_cache_or_cross_photo_state(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    endpoint = f"/api/v1/photos/{photo.id}/metadata"
    one = client.get(endpoint, headers=headers).json()
    path.write_bytes(inject(common_exif()))
    two = client.get(endpoint, headers=headers).json()
    assert one["source_sha256"] != two["source_sha256"] and one["camera"]["make"] is None
    path.write_bytes(SAMPLE.read_bytes())
    assert client.get(endpoint, headers=headers).json() == one


def test_customer_catalog_has_no_detailed_metadata(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    Path(storage.get_path(photo.storage_key)).write_bytes(inject(common_exif()))
    headers = {"Authorization": "Bearer " + create_access_token(str(users[2].id))}
    response = client.get(f"/api/v1/orders/{order.id}/photos/catalog", headers=headers)
    assert response.status_code == 200
    assert all(
        word not in response.text
        for word in ["latitude", "longitude", "serial_number", "PRIVATE-SERIAL", "摄影师"]
    )
    assert response.json()["items"][0]["annotation"] is None


def test_malformed_optional_iptc_duplicate_packets_and_partial_icc():
    value = parse(
        segment(0xED, b"Photoshop 3.0\0broken"),
        common_exif(),
        common_exif("Other"),
        segment(0xE2, b"ICC_PROFILE\0\x01\x02part"),
    )
    assert value.camera.make == "Canon"
    assert {"iptc.invalid_packet", "exif.duplicate_packet", "icc.invalid_chunks"} <= set(
        value.warnings
    )


def test_valid_utf16_xmp_and_escaped_text():
    value = parse(xmp_segment("<dc:title>中文 &amp; &lt;script&gt;</dc:title>", encoding="utf-16"))
    assert value.description.title == "中文 & <script>"


def test_keyword_limit_language_limit_and_invalid_gps():
    value = parse(
        iptc_segment([(25, f"word-{i}") for i in range(70)]),
        xmp_segment(
            "<exif:GPSLatitude>91</exif:GPSLatitude><exif:GPSLongitude>120</exif:GPSLongitude>"
        ),
    )
    assert len(value.description.keywords) == 64 and "keywords.truncated" in value.warnings
    assert value.gps is None and "gps.invalid" in value.warnings
    with pytest.raises(AppException) as error:
        parse(
            xmp_segment(
                "<dc:title><rdf:Alt>"
                + "".join(f'<rdf:li xml:lang="lang-{i}">a</rdf:li>' for i in range(17))
                + "</rdf:Alt></dc:title>"
            )
        )
    assert error.value.status_code == 413


@pytest.mark.parametrize("date", ["2026:99:17 14:32:18", "2026:10:17 25:32:18", "unknown"])
def test_invalid_dates_return_null_and_warning(date):
    value = parse(exif_segment(exif=[(36867, 2, date)]))
    assert value.capture.date_time_original is None and "exif.invalid_date" in value.warnings


def test_bounded_mutated_exif_never_raises_unclassified_errors():
    # Reproducible hostile offsets/types/counts, not a claim of comprehensive fuzzing.
    import random

    randomizer = random.Random(17)
    sample = bytearray(common_exif())
    for _ in range(300):
        mutated = sample.copy()
        for _ in range(randomizer.randint(1, 6)):
            mutated[randomizer.randrange(10, len(mutated))] = randomizer.randrange(256)
        try:
            service.normalize_metadata(1, inject(bytes(mutated)))
        except AppException as exc:
            assert exc.status_code in (413, 415, 422)


def test_path_escape_and_io_error_do_not_leak_private_values(client, jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    photo.storage_key = "../private.jpg"
    db.commit()
    assert client.get(f"/api/v1/photos/{photo.id}/metadata", headers=headers).status_code == 422
    with patch.object(service, "get_storage", side_effect=OSError("GPS SECRET")):
        result = client.get(f"/api/v1/photos/{photo.id}/metadata", headers=headers)
        assert result.status_code == 503 and "SECRET" not in result.text
