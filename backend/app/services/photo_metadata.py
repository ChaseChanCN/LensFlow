"""Source-bound, read-only metadata normalization. No cache, database writes or pixel decode."""

import hashlib
import math
import re
from contextlib import contextmanager
from datetime import datetime
from io import BytesIO
from threading import BoundedSemaphore

from PIL import ImageCms

from app.core.config import settings
from app.core.exceptions import AppException, NotFoundException
from app.schemas.photo_metadata import (
    CameraMetadata,
    CaptureMetadata,
    DescriptionMetadata,
    GPSMetadata,
    ImageMetadata,
    MetadataDate,
    PhotoMetadataResponse,
)
from app.services.metadata_embedded import clean_text, iptc_fields, xmp_fields
from app.services.metadata_segments import jpeg_segments, source_hash, tiff_fields
from app.services.storage import get_storage

_slots = BoundedSemaphore(2)


@contextmanager
def metadata_slot():
    if not _slots.acquire(blocking=False):
        raise AppException("METADATA_BUSY", "Metadata reader is busy; retry later", status_code=429)
    try:
        yield
    finally:
        _slots.release()


def number(value, low, high, warnings, field, *, integer=False):
    if isinstance(value, list) and len(value) == 1:
        value = value[0]
    if value is None:
        return None
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not low <= value <= high
        or (integer and int(value) != value)
    ):
        warnings.add(f"{field}.invalid")
        return None
    return int(value) if integer else float(value)


def date_value(value, source, warnings):
    if value is None:
        return None
    # Date-only editorial information is preserved as such, never midnight capture.
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?", value
    ):
        warnings.add(f"{source}.invalid_date")
        return None
    try:
        if len(value) == 10:
            datetime.strptime(value, "%Y-%m-%d")
        else:
            datetime.fromisoformat(value)
        offset = re.search(r"[+-](\d{2}):(\d{2})$", value)
        if offset and (
            int(offset[1]) > 14
            or int(offset[2]) > 59
            or (int(offset[1]) == 14 and int(offset[2]) != 0)
        ):
            raise ValueError
    except ValueError:
        warnings.add(f"{source}.invalid_date")
        return None
    return MetadataDate(
        source=source,
        value=value,
        timezone_known=value.endswith("Z") or offset is not None,
        precision="date" if len(value) == 10 else "fractional" if "." in value else "second",
    )


def capture_dates(exif, iptc, xmp, warnings):
    values = []
    raw = clean_text(exif.get(36867), warnings)
    if raw:
        if re.fullmatch(r"\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}", raw):
            raw = raw[:10].replace(":", "-") + "T" + raw[11:]
        sub = clean_text(exif.get(37521), warnings)
        if sub:
            if re.fullmatch(r"\d{1,9}", sub):
                raw += "." + sub
            else:
                warnings.add("exif.invalid_subsecond")
        offset = clean_text(exif.get(36881), warnings)
        if offset:
            if re.fullmatch(r"[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00", offset):
                raw += offset
            else:
                warnings.add("exif.invalid_offset_time")
        values.append(date_value(raw, "exif", warnings))
    values.extend(
        [
            date_value(xmp.get("date"), "xmp.photoshop", warnings),
            date_value(xmp.get("create_date"), "xmp.create", warnings),
        ]
    )
    date = iptc.get("date")
    if date:
        if re.fullmatch(r"\d{8}", date):
            date = f"{date[:4]}-{date[4:6]}-{date[6:]}"
            time = iptc.get("time")
            if time:
                if re.fullmatch(r"\d{6}(?:[+-]\d{4})?", time):
                    date += f"T{time[:2]}:{time[2:4]}:{time[4:6]}"
                    if len(time) > 6:
                        date += time[6:9] + ":" + time[9:]
                else:
                    warnings.add("iptc.invalid_time")
        values.append(date_value(date, "iptc", warnings))
    values = [value for value in values if value]
    if len({value.value for value in values}) > 1:
        warnings.add("capture.date_ambiguity")
    return values


def extract_gps(gps, xmp, warnings):
    def dms(key, ref, limit, positive, negative):
        values = gps.get(key)
        direction = clean_text(gps.get(ref), warnings)
        if values is None:
            return None
        if (
            not isinstance(values, list)
            or len(values) != 3
            or direction not in (positive, negative)
        ):
            warnings.add("gps.invalid_coordinate")
            return None
        deg, minute, second = values
        if not (0 <= deg <= limit and 0 <= minute < 60 and 0 <= second < 60):
            warnings.add("gps.invalid_coordinate")
            return None
        result = deg + minute / 60 + second / 3600
        if result > limit:
            warnings.add("gps.invalid_coordinate")
            return None
        return result if direction == positive else -result

    def xmp_coordinate(key, limit, positive, negative):
        raw = xmp.get(key)
        if raw is None:
            return None
        # Standard XMP D,MM.mmmmN or signed decimal degrees only.
        match = re.fullmatch(r"(\d{1,3}),(\d{1,2}(?:\.\d{1,10})?)([NSEW])", raw)
        if match and match[3] in (positive, negative) and float(match[2]) < 60:
            result = float(match[1]) + float(match[2]) / 60
            if match[3] == negative:
                result = -result
        elif re.fullmatch(r"[+-]?\d{1,3}(?:\.\d{1,10})?", raw):
            result = float(raw)
        else:
            warnings.add("xmp.invalid_gps")
            return None
        return number(result, -limit, limit, warnings, "gps")

    lat, lon = dms(2, 1, 90, "N", "S"), dms(4, 3, 180, "E", "W")
    if lat is not None and lon is not None:
        altitude = number(gps.get(6), 0, 100000, warnings, "gps.altitude")
        ref = gps.get(5)
        if altitude is not None:
            altitude = altitude * (-1 if ref == 1 else 1) if ref in (0, 1) else None
        return GPSMetadata(latitude=lat, longitude=lon, altitude_m=altitude), "exif"
    # Never combine latitude from one source with longitude from another.
    lat, lon = xmp_coordinate("latitude", 90, "N", "S"), xmp_coordinate("longitude", 180, "E", "W")
    if lat is not None and lon is not None:
        return GPSMetadata(latitude=lat, longitude=lon), "xmp"
    if gps or xmp.get("latitude") or xmp.get("longitude"):
        warnings.add("gps.incomplete")
    return None, None


def normalize_metadata(photo_id: int, data: bytes) -> PhotoMetadataResponse:
    segments = jpeg_segments(data)
    warnings = segments.warnings
    root, exif, gps = (
        tiff_fields(segments.exif, warnings) if segments.exif is not None else ({}, {}, {})
    )
    iptc = iptc_fields(segments.iptc, warnings)
    xmp = xmp_fields(segments.xmp, warnings)
    provenance = {}
    camera = CameraMetadata()
    for field, tags, tag in [
        ("make", root, 271),
        ("model", root, 272),
        ("lens_make", exif, 42035),
        ("lens_model", exif, 42036),
        ("serial_number", exif, 42033),
    ]:
        value = clean_text(tags.get(tag), warnings)
        if value:
            setattr(camera, field, value)
            provenance["camera." + field] = "exif"
    capture = CaptureMetadata()
    ranges = [
        ("exposure_seconds", exif, 33434, 1e-7, 86400, False),
        ("f_number", exif, 33437, 0.1, 1024, False),
        ("iso", exif, 34855, 1, 10_000_000, True),
        ("focal_length_mm", exif, 37386, 0.1, 100000, False),
        ("focal_length_35mm_mm", exif, 41989, 1, 65535, True),
        ("exposure_bias_ev", exif, 37380, -100, 100, False),
        ("orientation", root, 274, 1, 8, True),
    ]
    for field, tags, tag, low, high, integer in ranges:
        value = number(tags.get(tag), low, high, warnings, "capture." + field, integer=integer)
        setattr(capture, field, value)
        if value is not None:
            provenance["capture." + field] = "exif"
    flash = number(exif.get(37385), 0, 65535, warnings, "capture.flash", integer=True)
    if flash is not None:
        capture.flash_fired = bool(flash & 1)
        provenance["capture.flash_fired"] = "exif"
    capture.date_candidates = capture_dates(exif, iptc, xmp, warnings)
    original = next((v for v in capture.date_candidates if v.source == "exif"), None)
    if original:
        capture.date_time_original, capture.timezone_known = original.value, original.timezone_known
        provenance["capture.date_time_original"] = "exif"
    description = DescriptionMetadata(localized=xmp.get("localized", {}))
    for field, tag in (("title", None), ("caption", 270), ("creator", 315), ("copyright", 33432)):
        options = [
            ("xmp", xmp.get(field)),
            ("iptc", iptc.get(field)),
            ("exif", clean_text(root.get(tag), warnings)),
        ]
        present = [(source, value) for source, value in options if value]
        if present:
            setattr(description, field, present[0][1])
            provenance["description." + field] = present[0][0]
            if len({value for _, value in present}) > 1:
                warnings.add("description." + field + ".conflict")
    description.keywords = xmp.get("keywords") or iptc.get("keywords", [])
    if description.keywords:
        provenance["description.keywords"] = "xmp" if xmp.get("keywords") else "iptc"
    image = ImageMetadata(
        width=segments.width,
        height=segments.height,
        oriented_width=segments.height if capture.orientation in (5, 6, 7, 8) else segments.width,
        oriented_height=segments.width if capture.orientation in (5, 6, 7, 8) else segments.height,
    )
    if exif.get(40961) == 1:
        image.color_space = "sRGB"
        provenance["image.color_space"] = "exif"
    elif exif.get(40961) == 65535:
        image.color_space = "uncalibrated"
        provenance["image.color_space"] = "exif"
    if segments.icc:
        if "icc.invalid_chunks" in warnings or len(segments.icc) != segments.icc_count:
            warnings.add("icc.invalid_chunks")
        else:
            profile = b"".join(segments.icc[i] for i in range(1, segments.icc_count + 1))
            try:
                cms = ImageCms.ImageCmsProfile(BytesIO(profile))
                image.icc_profile_name = clean_text(ImageCms.getProfileDescription(cms), warnings)
                image.icc_profile_sha256 = hashlib.sha256(profile).hexdigest()
                provenance["image.icc_profile_name"] = "icc"
            except (OSError, ValueError, TypeError, ImageCms.PyCMSError):
                warnings.add("icc.invalid_profile")
    location, gps_source = extract_gps(gps, xmp, warnings)
    if gps_source:
        provenance["gps"] = gps_source
    return PhotoMetadataResponse(
        photo_id=photo_id,
        source_sha256=source_hash(data),
        camera=camera,
        capture=capture,
        description=description,
        image=image,
        gps=location,
        provenance=provenance,
        warnings=sorted(warnings),
    )


def read_photo_metadata(photo_id: int, storage_key: str) -> PhotoMetadataResponse:
    with metadata_slot():
        try:
            # Fail explicitly before constructing an optional OBS SDK client.
            if settings.storage_type != "local":
                raise AppException(
                    "STORAGE_UNAVAILABLE",
                    "Binary metadata reads unavailable for this storage",
                    status_code=503,
                )
            with get_storage().open_read(storage_key) as stream:
                content = stream.read(settings.image_max_bytes + 1)
        except FileNotFoundError:
            raise NotFoundException("Photo file") from None
        except (OSError, ImportError):
            raise AppException(
                "STORAGE_UNAVAILABLE", "Photo storage unavailable", status_code=503
            ) from None
        return normalize_metadata(photo_id, content)
