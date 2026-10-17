"""Bounded parser regressions; constructed tags are never camera-origin evidence."""

import hashlib
import json
import struct
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image, ImageOps

from app.services import photo_metadata as service
from app.services.image_editor import srgb_profile
from tests.media_fixtures import SAMPLE
from tests.metadata_samples import (
    XMP_HEADER,
    common_exif,
    exif_segment,
    inject,
    segment,
    xmp_segment,
)

REPOSITORY = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((SAMPLE.parent / "metadata-manifest.json").read_text(encoding="utf-8"))


def parse(*packets):
    return service.normalize_metadata(1, inject(*packets))


def iptc_packet(records, *, utf8=False, extended=False):
    """Independent IIM byte builder; never claim generated labels are source metadata."""
    packet = b"\x1c\x01\x5a\x00\x03\x1b%G" if utf8 else b""
    for tag, value in records:
        size = (
            b"\x80\x02" + struct.pack(">H", len(value))
            if extended
            else struct.pack(">H", len(value))
        )
        packet += b"\x1c\x02" + bytes([tag]) + size + value
    resource = b"8BIM\x04\x04\0\0" + struct.pack(">I", len(packet)) + packet
    resource += b"\0" if len(packet) % 2 else b""
    return segment(0xED, b"Photoshop 3.0\0" + resource)


@pytest.mark.parametrize("entry", MANIFEST["files"], ids=lambda entry: entry["id"])
def test_existing_corpus_manifest_matches_independent_pillow_and_hash(entry):
    path = (REPOSITORY / entry["path"]).resolve()
    assert path.is_relative_to(REPOSITORY)
    before = path.read_bytes()
    assert hashlib.sha256(before).hexdigest() == entry["sha256"]
    assert len(before) == entry["size_bytes"]
    with Image.open(BytesIO(before)) as source:
        exif = source.getexif()
        nested = exif.get_ifd(34665)
        observed = {
            "format": source.format,
            "exif_present": bool(exif),
            "icc_present": bool(source.info.get("icc_profile")),
            "make": exif.get(271),
            "model": exif.get(272),
            "lens_model": nested.get(42036),
        }
        assert source.size == (entry["width"], entry["height"])
    assert observed == entry["independent_pillow_expectation"]
    normalized = service.normalize_metadata(1, before)
    assert normalized.source_sha256 == entry["sha256"]
    assert normalized.camera.make == observed["make"]
    assert path.read_bytes() == before
    assert entry["camera_origin_verified"] is False


def test_manifest_never_promotes_constructed_camera_labels_to_real_coverage():
    assert MANIFEST["manifest_version"] == 1
    assert set(MANIFEST["real_camera_coverage"]) == {"Canon", "Nikon", "Sony"}
    assert all(
        value == {"verified_samples": 0, "status": "not_verified"}
        for value in MANIFEST["real_camera_coverage"].values()
    )
    for entry in MANIFEST["files"]:
        if entry["independent_pillow_expectation"]["make"]:
            assert entry["classification"] == "constructed_metadata_injection"
            assert entry["derived_from"] == "grace-hopper-photographic-source"
        assert (REPOSITORY / entry["source_record"]).is_file()


@pytest.mark.parametrize("orientation", range(1, 9))
def test_all_exif_orientations_keep_physical_dimensions_and_independent_display_size(orientation):
    data = inject(exif_segment([(274, 3, orientation)]))
    before = hashlib.sha256(data).hexdigest()
    value = service.normalize_metadata(1, data)
    with Image.open(BytesIO(data)) as independent:
        assert independent.getexif()[274] == orientation
        assert (value.image.width, value.image.height) == independent.size
        with ImageOps.exif_transpose(independent) as oriented:
            assert (value.image.oriented_width, value.image.oriented_height) == oriented.size
    assert value.capture.orientation == orientation
    assert value.source_sha256 == before == hashlib.sha256(data).hexdigest()


@pytest.mark.parametrize("order", [(1, 2, 3), (3, 1, 2), (2, 3, 1)])
def test_multipart_icc_reassembles_by_sequence_not_app_order(order):
    profile = srgb_profile()
    split = [profile[:100], profile[100:300], profile[300:]]
    packets = [segment(0xE2, b"ICC_PROFILE\0" + bytes([i, 3]) + split[i - 1]) for i in order]
    data = inject(segment(0xEF, b"unrelated APP data"), *packets)
    value = service.normalize_metadata(1, data)
    with Image.open(BytesIO(data)) as independent:
        assert independent.info["icc_profile"] == profile
    assert value.image.icc_profile_sha256 == hashlib.sha256(profile).hexdigest()
    assert "sRGB" in value.image.icc_profile_name
    assert not any(warning.startswith("icc.") for warning in value.warnings)


@pytest.mark.parametrize(
    "chunks",
    [
        [(1, 2), (1, 2), (2, 2)],
        [(1, 2), (2, 3)],
        [(0, 2), (2, 2)],
        [(3, 2), (1, 2)],
        [(1, 2)],
    ],
    ids=["duplicate", "inconsistent-total", "zero-sequence", "out-of-range", "missing"],
)
def test_malformed_icc_chunks_do_not_poison_safe_exif_or_invent_profile(chunks):
    packets = [
        segment(0xE2, b"ICC_PROFILE\0" + bytes([sequence, total]) + b"part")
        for sequence, total in chunks
    ]
    value = parse(common_exif(), *packets)
    assert value.camera.model == "Canon constructed sample"
    assert value.image.icc_profile_name is None and value.image.icc_profile_sha256 is None
    assert "icc.invalid_chunks" in value.warnings


def test_legacy_iptc_latin1_fallback_preserves_accents_and_reports_policy():
    value = parse(
        iptc_packet(
            [
                (5, b"Caf\xe9"),
                (120, b"Cr\xe8me br\xfbl\xe9e"),
                (25, b"\xe9t\xe9"),
                (25, b"\xe9t\xe9"),
            ]
        )
    )
    assert value.description.title == "Café"
    assert value.description.caption == "Crème brûlée"
    assert value.description.keywords == ["été"]
    assert value.provenance["description.title"] == "iptc"
    assert "iptc.latin1_fallback" in value.warnings
    assert value.capture.date_time_original is None and value.camera.make is None


def test_multiple_app13_utf8_records_and_extended_iim_length():
    value = parse(
        iptc_packet([(5, "授权测试标题".encode()), (25, "人像".encode())], utf8=True),
        iptc_packet(
            [(80, "测试作者".encode()), (25, "摄影".encode()), (25, "人像".encode())],
            utf8=True,
            extended=True,
        ),
    )
    assert value.description.title == "授权测试标题"
    assert value.description.creator == "测试作者"
    assert value.description.keywords == ["人像", "摄影"]
    assert not any(warning.startswith("iptc.") for warning in value.warnings)


def test_iptc_declared_utf8_invalid_field_is_omitted_without_mojibake_or_guess():
    value = parse(iptc_packet([(5, b"bad-\xff-title"), (120, b"valid caption")], utf8=True))
    assert value.description.title is None
    assert value.description.caption == "valid caption"
    assert "iptc.invalid_encoding" in value.warnings
    assert "bad-" not in value.model_dump_json() and "\ufffd" not in value.model_dump_json()


def test_xmp_namespace_identity_ignores_spoofed_prefix_and_accepts_renamed_prefix():
    xml = (
        b'<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        b'xmlns:dc="https://spoof.invalid/dc" xmlns:legit="http://purl.org/dc/elements/1.1/">'
        b'<r:Description dc:title="not trusted"><dc:description>not trusted</dc:description>'
        b"<legit:title>Allowed namespace</legit:title></r:Description></r:RDF>"
    )
    value = parse(segment(0xE1, XMP_HEADER + xml))
    assert value.description.title == "Allowed namespace"
    assert value.description.caption is None
    assert "not trusted" not in value.model_dump_json()


def test_multiple_standard_xmp_packets_keep_first_and_record_warning():
    value = parse(
        xmp_segment("<dc:title>First</dc:title>"), xmp_segment("<dc:title>Second</dc:title>")
    )
    assert value.description.title == "First"
    assert "xmp.duplicate_packet" in value.warnings


@pytest.mark.parametrize(
    "xml",
    [
        b"<!DOCTYPE x><x/>",
        b'<!DOCTYPE x [<!ENTITY % remote SYSTEM "https://private.invalid/secret">%remote;]><x/>',
        '<?xml version="1.0" encoding="UTF-16BE"?><!DOCTYPE x [<!ENTITY q SYSTEM "file:///private">]><x>&q;</x>'.encode(
            "utf-16-be"
        ),
    ],
    ids=["plain-doctype", "parameter-entity", "utf16be-external-entity"],
)
def test_xmp_dtd_rejection_is_explicit_and_does_not_access_io(xml):
    data = inject(common_exif(), segment(0xE1, XMP_HEADER + xml))
    with (
        patch("socket.create_connection", side_effect=AssertionError("network access")),
        patch("builtins.open", side_effect=AssertionError("filesystem access")),
    ):
        value = service.normalize_metadata(1, data)
    assert value.camera.make == "Canon"
    assert "xmp.invalid_or_unsafe_packet" in value.warnings
    assert value.description.title is None
    assert (
        "private.invalid" not in value.model_dump_json()
        and "file:///" not in value.model_dump_json()
    )


@pytest.mark.parametrize("offset", ["-14:00", "+14:00", "+00:00", ""])
def test_exif_wallclock_and_nine_subseconds_are_not_converted_to_utc(offset):
    value = parse(
        exif_segment(
            [(271, 2, "Constructed maker")],
            [(36867, 2, "2024:02:29 00:00:01"), (37521, 2, "000000123"), (36881, 2, offset)],
        ),
        xmp_segment("<xmp:CreateDate>1999-12-31T23:59:59Z</xmp:CreateDate>"),
    )
    assert value.capture.date_time_original == "2024-02-29T00:00:01.000000123" + offset
    assert value.capture.timezone_known is bool(offset)
    assert value.capture.date_candidates[0].precision == "fractional"
    assert value.camera.lens_make is None and value.camera.lens_model is None
    assert "camera.lens_model" not in value.provenance
    assert "capture.date_ambiguity" in value.warnings


def test_mixed_optional_packets_preserve_file_hash_mtime_and_no_cross_read_state(jpeg_case):
    _, _, _, photo, storage, _ = jpeg_case
    path = Path(storage.get_path(photo.storage_key))
    payload = inject(
        exif_segment([(271, 2, "Constructed missing-lens")]),
        iptc_packet([(5, b"Caf\xe9")]),
        segment(0xE1, XMP_HEADER + b"<!DOCTYPE x><x/>"),
        segment(0xE2, b"ICC_PROFILE\0\x01\x02incomplete"),
    )
    path.write_bytes(payload)
    original_hash = hashlib.sha256(payload).hexdigest()
    mtime = path.stat().st_mtime_ns
    first = service.read_photo_metadata(photo.id, photo.storage_key)
    service.normalize_metadata(999, inject(common_exif("Other constructed maker")))
    second = service.read_photo_metadata(photo.id, photo.storage_key)
    assert first == second
    assert first.source_sha256 == original_hash
    assert first.camera.make == "Constructed missing-lens" and first.camera.lens_model is None
    assert first.description.title == "Café"
    assert {"iptc.latin1_fallback", "xmp.invalid_or_unsafe_packet", "icc.invalid_chunks"} <= set(
        first.warnings
    )
    assert path.stat().st_mtime_ns == mtime
    assert path.read_bytes() == payload
    assert hashlib.sha256(SAMPLE.read_bytes()).hexdigest() == MANIFEST["files"][0]["sha256"]
