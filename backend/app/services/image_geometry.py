"""Normalized edges in the rotated, then flipped image."""

import math
from contextlib import contextmanager

from PIL import Image

from app.schemas.image_edit import CropRectangle, GeometryParameters


def transformed_size(width: int, height: int, quadrants: int):
    return (height, width) if quadrants % 2 else (width, height)


def pixel_crop_box(width: int, height: int, crop: CropRectangle | None):
    if crop is None:
        return (0, 0, width, height)

    def edge(value, extent, upper):
        scaled = value * extent
        nearest = round(scaled)
        if abs(scaled - nearest) <= 1e-9:
            scaled = nearest
        return math.ceil(scaled) if upper else math.floor(scaled)

    left = min(width - 1, max(0, edge(crop.x, width, False)))
    top = min(height - 1, max(0, edge(crop.y, height, False)))
    right = min(width, max(left + 1, edge(crop.x + crop.width, width, True)))
    bottom = min(height, max(top + 1, edge(crop.y + crop.height, height, True)))
    return left, top, right, bottom


@contextmanager
def geometry_image(source: Image.Image, geometry: GeometryParameters):
    current = source
    try:
        operations = []
        if geometry.rotation_quadrants:
            operations.append(
                {
                    1: Image.Transpose.ROTATE_270,
                    2: Image.Transpose.ROTATE_180,
                    3: Image.Transpose.ROTATE_90,
                }[geometry.rotation_quadrants]
            )
        if geometry.flip_horizontal:
            operations.append(Image.Transpose.FLIP_LEFT_RIGHT)
        if geometry.flip_vertical:
            operations.append(Image.Transpose.FLIP_TOP_BOTTOM)
        for operation in operations:
            next_image = current.transpose(operation)
            if current is not source:
                current.close()
            current = next_image
        if geometry.crop:
            next_image = current.crop(pixel_crop_box(*current.size, geometry.crop))
            if current is not source:
                current.close()
            current = next_image
        yield current
    finally:
        if current is not source:
            current.close()
