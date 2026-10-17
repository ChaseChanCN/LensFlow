"""Version 1 read-only source metadata. No raw tags or storage references."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MetadataModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class CameraMetadata(MetadataModel):
    make: str | None = None
    model: str | None = None
    lens_make: str | None = None
    lens_model: str | None = None
    serial_number: str | None = None


class MetadataDate(MetadataModel):
    source: Literal["exif", "xmp.photoshop", "xmp.create", "iptc"]
    value: str
    timezone_known: bool
    precision: Literal["date", "second", "fractional"]


class CaptureMetadata(MetadataModel):
    date_time_original: str | None = None
    timezone_known: bool = False
    date_candidates: list[MetadataDate] = Field(default_factory=list)
    exposure_seconds: float | None = None
    f_number: float | None = None
    iso: int | None = None
    focal_length_mm: float | None = None
    focal_length_35mm_mm: int | None = None
    exposure_bias_ev: float | None = None
    flash_fired: bool | None = None
    orientation: int | None = None


class DescriptionMetadata(MetadataModel):
    title: str | None = None
    caption: str | None = None
    creator: str | None = None
    copyright: str | None = None
    keywords: list[str] = Field(default_factory=list)
    # XMP rdf:Alt values, indexed by field then xml:lang. Never raw XML.
    localized: dict[str, dict[str, str]] = Field(default_factory=dict)


class ImageMetadata(MetadataModel):
    width: int
    height: int
    oriented_width: int
    oriented_height: int
    color_space: str | None = None
    icc_profile_name: str | None = None
    icc_profile_sha256: str | None = None


class GPSMetadata(MetadataModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude_m: float | None = None


class PhotoMetadataResponse(MetadataModel):
    metadata_version: Literal[1] = 1
    photo_id: int
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    camera: CameraMetadata = Field(default_factory=CameraMetadata)
    capture: CaptureMetadata = Field(default_factory=CaptureMetadata)
    description: DescriptionMetadata = Field(default_factory=DescriptionMetadata)
    image: ImageMetadata
    gps: GPSMetadata | None = None
    provenance: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
