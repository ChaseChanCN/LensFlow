"""Canonical exact metadata filters; no LIKE, time-zone guesses or fuzzy aliases."""

import math
import re
from dataclasses import asdict, dataclass
from datetime import date

from app.core.exceptions import ValidationException

DEVICE_FIELDS = ("camera_make", "camera_model", "lens_make", "lens_model")
RANGES = {"iso": (1, 10_000_000), "focal": (0.1, 100000), "aperture": (0.1, 1024)}
METADATA_KEYS = {
    *DEVICE_FIELDS,
    *(f"{field}_{side}" for field in RANGES for side in ("min", "max")),
    "captured_from",
    "captured_to",
    "capture_unknown",
    "metadata_status",
}


def device_value(value):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 160 or any(ord(c) < 32 for c in value):
        raise ValidationException("Invalid metadata device value")
    value = " ".join(value.split()).lower()
    if not value or len(value) > 160:
        raise ValidationException("Invalid metadata device value")
    return value


@dataclass(frozen=True)
class MetadataFilters:
    camera_make: str | None = None
    camera_model: str | None = None
    lens_make: str | None = None
    lens_model: str | None = None
    iso_min: int | None = None
    iso_max: int | None = None
    focal_min: float | None = None
    focal_max: float | None = None
    aperture_min: float | None = None
    aperture_max: float | None = None
    captured_from: str | None = None
    captured_to: str | None = None
    capture_unknown: bool = False
    metadata_status: str | None = None

    @property
    def active(self):
        return any(value is not None and value is not False for value in asdict(self).values())

    @property
    def needs_indexed(self):
        return any(
            value is not None and value is not False
            for key, value in asdict(self).items()
            if key != "metadata_status"
        )

    def identity(self):
        return asdict(self)


def normalize_metadata_filters(values):
    clean = {}
    for key in DEVICE_FIELDS:
        clean[key] = device_value(values.get(key))
    for field, (low, high) in RANGES.items():
        for side in ("min", "max"):
            key = f"{field}_{side}"
            value = values.get(key)
            if value is None:
                continue
            if (
                not isinstance(value, str)
                or not re.fullmatch(r"\d+(?:\.\d+)?", value)
                or len(value) > 16
            ):
                raise ValidationException("Invalid metadata numeric range")
            number = float(value)
            if (
                not math.isfinite(number)
                or not low <= number <= high
                or (field == "iso" and not value.isdigit())
            ):
                raise ValidationException("Metadata numeric range exceeds limits")
            clean[key] = int(number) if field == "iso" else number
        if clean.get(field + "_min", low) > clean.get(field + "_max", high):
            raise ValidationException("Metadata minimum exceeds maximum")
    for key in ("captured_from", "captured_to"):
        value = values.get(key)
        if value is None:
            continue
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError
            clean[key] = date.fromisoformat(value).isoformat()
        except (TypeError, ValueError):
            raise ValidationException("Invalid capture-local date") from None
    if clean.get("captured_from", "0001-01-01") > clean.get("captured_to", "9999-12-31"):
        raise ValidationException("Capture date range is reversed")
    if values.get("capture_unknown") is not None:
        if values["capture_unknown"] != "true":
            raise ValidationException("capture_unknown must be true or omitted")
        clean["capture_unknown"] = True
        if clean.get("captured_from") or clean.get("captured_to"):
            raise ValidationException("Unknown capture date cannot have a date range")
    if (status := values.get("metadata_status")) is not None:
        if status not in ("pending", "indexed", "failed", "unsupported"):
            raise ValidationException("Invalid metadata status")
        clean["metadata_status"] = status
    result = MetadataFilters(**clean)
    if result.needs_indexed and result.metadata_status not in (None, "indexed"):
        raise ValidationException("Photographic filters require indexed metadata")
    return result
