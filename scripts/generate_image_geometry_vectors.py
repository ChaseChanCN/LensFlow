"""Reproduce tiny backend-owned geometry vectors. No database or storage mutation."""

import json
import sys
from io import BytesIO
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
import numpy as np
from app.schemas.image_edit import EditParametersV2
from app.services.image_editor import apply_edits, decode_jpeg
from app.services.image_geometry import geometry_image, pixel_crop_box, transformed_size
from PIL import Image


def vectors():
    rgb = np.zeros((5, 7, 3), dtype=np.uint8)
    for y in range(5):
        for x in range(7):
            rgb[y, x] = [
                (x * 37 + y * 13) % 256,
                (y * 49 + x * 7) % 256,
                (x * 17 + y * 31) % 256,
            ]
    with (
        Image.open(root / "backend/tests/fixtures/grace_hopper.jpg") as real,
        BytesIO() as out,
    ):
        exif = Image.Exif()
        exif[274] = 6
        real.save(out, "JPEG", exif=exif)
        oriented = decode_jpeg(out.getvalue())
        oriented.thumbnail((23, 23))
        portrait = decode_jpeg(
            (root / "backend/tests/fixtures/grace_hopper.jpg").read_bytes()
        )
        portrait.thumbnail((23, 23))
    pattern = Image.fromarray(rgb)
    landscape = portrait.transpose(Image.Transpose.ROTATE_270)
    cases = []
    try:
        for label, image in [
            ("asymmetric-odd", pattern),
            ("real-portrait", portrait),
            ("real-landscape", landscape),
            ("real-exif-6", oriented),
        ]:
            for q, h, v, crop in [
                (0, False, False, None),
                (1, False, False, None),
                (2, True, False, None),
                (3, True, True, {"x": 0.1, "y": 0.2, "width": 0.7, "height": 0.6}),
            ]:
                edit = EditParametersV2(
                    schema_version=2,
                    exposure_ev=0.7,
                    contrast=25,
                    saturation=-30,
                    geometry={
                        "rotation_quadrants": q,
                        "flip_horizontal": h,
                        "flip_vertical": v,
                        "crop": crop,
                    },
                )
                # Copy because identity geometry returns its input.
                with (
                    geometry_image(image, edit.geometry) as geometry,
                    geometry.copy() as result,
                ):
                    apply_edits(result, edit)
                    cases.append(
                        {
                            "name": f"{label}-q{q}",
                            "width": image.width,
                            "height": image.height,
                            "rgb": np.asarray(image).reshape(-1).tolist(),
                            "edit": edit.model_dump(),
                            "box": pixel_crop_box(
                                *transformed_size(*image.size, q),
                                edit.geometry.crop,
                            ),
                            "output_width": result.width,
                            "output_height": result.height,
                            "output_rgb": np.asarray(result).reshape(-1).tolist(),
                        }
                    )
    finally:
        for image in [pattern, portrait, landscape, oriented]:
            image.close()
    return {
        "generator": "scripts/generate_image_geometry_vectors.py; actual Pillow + NumPy pipeline",
        "tolerance": {"channel_max": 1, "mean_absolute": 0.05, "geometry_pixels": 0},
        "cases": cases,
    }


if __name__ == "__main__":
    target = root / "frontend/src/utils/__fixtures__/image-geometry-v2.json"
    target.write_text(json.dumps(vectors(), separators=(",", ":")), encoding="utf-8")
    print(f"Generated {target}")
