"""Versioned pixel-edit contract: legacy v1 colors and v2 non-destructive geometry."""

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)


class EditParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    exposure_ev: Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-2, le=2)] = 0
    contrast: Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-100, le=100)] = 0
    saturation: Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-100, le=100)] = 0

    @field_validator("schema_version", mode="before")
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError("schema_version must be an integer")
        return value


UnitFloat = Annotated[float, Field(strict=True, allow_inf_nan=False, ge=0, le=1)]


class CropRectangle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: UnitFloat
    y: UnitFloat
    width: Annotated[float, Field(strict=True, allow_inf_nan=False, gt=0, le=1)]
    height: Annotated[float, Field(strict=True, allow_inf_nan=False, gt=0, le=1)]

    @model_validator(mode="after")
    def inside_image(self):
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("Crop must lie inside the transformed image")
        return self


class GeometryParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rotation_quadrants: Annotated[int, Field(strict=True, ge=0, le=3)] = 0
    flip_horizontal: Annotated[bool, Field(strict=True)] = False
    flip_vertical: Annotated[bool, Field(strict=True)] = False
    crop: CropRectangle | None = None


class EditParametersV2(EditParameters):
    schema_version: Literal[2] = 2
    geometry: GeometryParameters = Field(default_factory=GeometryParameters)


def legacy_version(value):
    if isinstance(value, dict) and "schema_version" not in value:
        return {**value, "schema_version": 1}
    return value


AnyEditParameters = Annotated[EditParameters | EditParametersV2, BeforeValidator(legacy_version)]
edit_parameters_adapter = TypeAdapter(AnyEditParameters)


def parse_edit_parameters(value):
    return edit_parameters_adapter.validate_python(value)


class ImageEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    edit: AnyEditParameters = Field(default_factory=EditParameters)
