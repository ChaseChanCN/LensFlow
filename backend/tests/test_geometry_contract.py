import pytest
from pydantic import ValidationError

from app.schemas.image_edit import CropRectangle, GeometryParameters, parse_edit_parameters
from app.services.image_geometry import pixel_crop_box, transformed_size


def test_versions_remain_explicit():
    assert parse_edit_parameters({"schema_version": 1, "exposure_ev": 0.7}).model_dump() == {
        "schema_version": 1,
        "exposure_ev": 0.7,
        "contrast": 0,
        "saturation": 0,
    }
    assert parse_edit_parameters({"exposure_ev": 0.7}).schema_version == 1
    assert parse_edit_parameters({"schema_version": 2}).geometry == GeometryParameters()


@pytest.mark.parametrize(
    "geometry",
    [
        {"rotation_quadrants": True},
        {"rotation_quadrants": 1.0},
        {"rotation_quadrants": 4},
        {"flip_horizontal": 1},
        {"flip_vertical": "false"},
        {"path": "private.jpg"},
        {"crop": {"x": 0, "y": 0, "width": 0, "height": 1}},
        {"crop": {"x": 0.5, "y": 0, "width": 0.6, "height": 1}},
        {"crop": {"x": float("nan"), "y": 0, "width": 0.5, "height": 1}},
        {"crop": {"x": 0, "y": 0, "width": float("inf"), "height": 1}},
        {"crop": {"x": "0", "y": 0, "width": 0.5, "height": 1}},
        {"crop": {"x": 0, "y": 0, "width": 0.5, "height": 1, "size": 50}},
    ],
)
def test_strict_geometry(geometry):
    with pytest.raises(ValidationError):
        parse_edit_parameters({"schema_version": 2, "geometry": geometry})


@pytest.mark.parametrize(
    "size,crop,expected",
    [
        ((7, 5), {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.6}, (0, 1, 5, 4)),
        (
            (1, 1),
            {"x": 0.999999, "y": 0.999999, "width": 0.000001, "height": 0.000001},
            (0, 0, 1, 1),
        ),
        ((101, 57), {"x": 0.99, "y": 0, "width": 0.01, "height": 1}, (99, 0, 101, 57)),
        ((10, 10), {"x": 0.3, "y": 0.3, "width": 0.6, "height": 0.6}, (3, 3, 9, 9)),
    ],
)
def test_pixel_edges(size, crop, expected):
    assert pixel_crop_box(*size, CropRectangle(**crop)) == expected
    for q in range(4):
        assert transformed_size(*size, q) == (size[::-1] if q % 2 else size)
