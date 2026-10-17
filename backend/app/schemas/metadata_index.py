"""Private derived-data API contracts; no raw EXIF, GPS or serial fields."""

from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

IndexStatus = Literal["pending", "indexed", "failed", "unsupported"]


class IndexRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IndexBatchRequest(IndexRequest):
    mode: Literal["missing", "retry", "refresh"] = "missing"
    limit: int = Field(default=5, strict=True, ge=1, le=10)
    cursor: str | None = Field(default=None, max_length=320, min_length=1)


class IndexResult(BaseModel):
    photo_id: int
    status: IndexStatus
    source_sha256: str | None = None
    parser_version: str
    reused: bool = False
    busy: bool = False
    error_code: str | None = None
    camera_make: str | None = None
    camera_model: str | None = None
    lens_make: str | None = None
    lens_model: str | None = None
    iso: int | None = None
    focal_length_mm: float | None = None
    f_number: float | None = None
    exposure_seconds: float | None = None
    capture_datetime_local: str | None = None
    capture_date: date | None = None
    capture_timezone_known: bool = False
    capture_timezone_offset_minutes: int | None = None
    indexed_at: datetime | None = None
    warning_count: int = 0

    @field_validator("indexed_at")
    @classmethod
    def index_time_utc(cls, value):
        if value is None:
            return value
        return (
            value.replace(tzinfo=timezone.utc)
            if value.tzinfo is None
            else value.astimezone(timezone.utc)
        )


class IndexCounts(BaseModel):
    total: int
    indexed: int
    pending: int
    failed: int
    unsupported: int
    unindexed: int
    active: int
    generation: str
    parser_version: str


class IndexBatchResponse(BaseModel):
    results: list[IndexResult]
    next_cursor: str | None
    counts: IndexCounts
    continuation: Literal["client_driven"] = "client_driven"


class FacetValue(BaseModel):
    value: str
    count: int


class MetadataFacets(BaseModel):
    camera_make: list[FacetValue]
    camera_model: list[FacetValue]
    lens_make: list[FacetValue]
    lens_model: list[FacetValue]
    truncated: bool
    counts: IndexCounts


class TimelineBucket(BaseModel):
    date: str
    count: int
    captured_from: str
    captured_to: str


class MetadataTimeline(BaseModel):
    level: Literal["year", "month", "day"]
    buckets: list[TimelineBucket]
    unknown: int
    matched: int
    counts: IndexCounts
    truncated: bool = False


class IndexIssue(BaseModel):
    photo_id: int
    filename: str
    index_status: IndexStatus
    error_code: str | None
    warning_count: int
    indexed_at: datetime | None
    retryable: bool
    current_parser_version: str
    parser_version: str | None
    identity_state: Literal["current_parser", "stale_parser", "unindexed"]
    source_verified: Literal[False] = False

    _index_time_utc = field_validator("indexed_at")(IndexResult.index_time_utc.__func__)


class IndexIssues(BaseModel):
    items: list[IndexIssue]
    next_cursor: str | None
