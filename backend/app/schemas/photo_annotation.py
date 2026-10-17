from datetime import datetime, timezone
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Rating = Annotated[int, Field(strict=True, ge=0, le=5)]
Revision = Annotated[int, Field(strict=True, ge=0, le=2147483646)]
Color = Literal['red', 'yellow', 'green', 'blue', 'purple']
Pick = Literal['unmarked', 'pick', 'reject']


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    photo_id: int
    rating: int = 0
    color_label: Color | None = None
    pick_status: Pick = 'unmarked'
    revision: int = 0
    exists: bool = False
    updated_at: datetime | None = None

    @field_validator('updated_at')
    @classmethod
    def utc_date(cls, value):
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


class SaveAnnotation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rating: Rating
    color_label: Color | None
    pick_status: Pick
    expected_revision: Revision


class AnnotationChanges(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rating: Rating | None = None
    color_label: Color | None = None
    pick_status: Pick | None = None

    @model_validator(mode='after')
    def fields_present(self):
        if not self.model_fields_set or any(getattr(self, k) is None for k in self.model_fields_set - {'color_label'}):
            raise ValueError('Provide at least one non-null change (color_label may be null)')
        return self


class BatchItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    photo_id: Annotated[int, Field(strict=True, ge=1, le=2**63-1)]
    expected_revision: Revision


class BatchAnnotations(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: Annotated[list[BatchItem], Field(min_length=1, max_length=100)]
    changes: AnnotationChanges

    @model_validator(mode='after')
    def unique_ids(self):
        if len({i.photo_id for i in self.items}) != len(self.items):
            raise ValueError('Duplicate photo IDs')
        return self


class BatchResult(BaseModel):
    photo_id: int
    status: Literal['success', 'conflict']
    annotation: AnnotationResponse


class BatchResponse(BaseModel):
    results: list[BatchResult]
    succeeded: int
    conflicted: int
