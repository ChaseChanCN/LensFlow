"""Bounded, read-only JPEG normalization shared by preview and export."""

import hashlib
import warnings
from contextlib import contextmanager
from functools import lru_cache
from io import BytesIO
from threading import BoundedSemaphore

import numpy as np
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.core.exceptions import AppException, NotFoundException
from app.schemas.image_edit import AnyEditParameters, EditParametersV2
from app.services.image_geometry import geometry_image
from app.services.storage import get_storage

_render_slot = BoundedSemaphore(1)


def fail(code: str, message: str, status: int = 422):
    raise AppException(code, message, status_code=status)


@lru_cache(maxsize=1)
def srgb_profile() -> bytes:
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def decode_jpeg(content: bytes) -> Image.Image:
    """Validate before allocating decoded pixels; return an owned, oriented RGB image."""
    if len(content) > settings.image_max_bytes:
        fail("IMAGE_TOO_LARGE", "JPEG exceeds byte limit", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format != "JPEG":
                    fail("UNSUPPORTED_IMAGE", "Only JPEG images are supported", 415)
                width, height = source.size
                if (
                    width * height > settings.image_max_pixels
                    or max(width, height) > settings.image_max_dimension
                ):
                    fail("IMAGE_TOO_LARGE", "Decoded image exceeds pixel/dimension limit", 413)
                if source.mode not in ("RGB", "L"):
                    fail(
                        "UNSUPPORTED_COLOR_SPACE", "Only RGB and grayscale JPEG are supported", 415
                    )
                icc = source.info.get("icc_profile")
                source.load()  # Reject truncated streams; Pillow's permissive flag stays disabled.
                with ImageOps.exif_transpose(source) as oriented:
                    if icc:
                        if len(icc) > 1024 * 1024:
                            fail("INVALID_ICC", "ICC profile exceeds limit")
                        profile = ImageCms.ImageCmsProfile(BytesIO(icc))
                        result = ImageCms.profileToProfile(
                            oriented,
                            profile,
                            ImageCms.ImageCmsProfile(BytesIO(srgb_profile())),
                            outputMode="RGB",
                        )
                    else:
                        result = oriented.convert("RGB")
                    # No stale orientation, EXIF/GPS, comments or unverified profiles escape.
                    result.info.clear()
                    return result
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        fail("IMAGE_TOO_LARGE", "Decoded image exceeds safety limit", 413)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, ImageCms.PyCMSError):
        fail("INVALID_JPEG", "Invalid JPEG data or color profile")


@contextmanager
def normalized_source(storage_key: str):
    try:
        storage = get_storage()
        with storage.open_read(storage_key) as stream:
            content = stream.read(settings.image_max_bytes + 1)
    except FileNotFoundError:
        raise NotFoundException("Photo file") from None
    except (OSError, ImportError):
        fail("STORAGE_UNAVAILABLE", "Photo storage is unavailable", 503)
    image = decode_jpeg(content)
    try:
        yield image, hashlib.sha256(content).hexdigest()
    finally:
        image.close()


@contextmanager
def render_slot():
    # Per worker: bound expensive decoding/processing instead of queuing unbounded RAM.
    if not _render_slot.acquire(blocking=False):
        fail("IMAGE_BUSY", "Image worker is busy; retry later", 429)
    try:
        yield
    finally:
        _render_slot.release()


def encode_jpeg(image: Image.Image) -> bytes:
    with BytesIO() as output:
        image.save(
            output, format="JPEG", quality=90, subsampling=0, icc_profile=srgb_profile(), exif=b""
        )
        return output.getvalue()


def preview_jpeg(storage_key: str, max_side: int = 1024, *, include_source_size=False):
    with render_slot(), normalized_source(storage_key) as (image, source_hash):
        source_size = image.size
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        result = encode_jpeg(image), image.size, source_hash
        return (*result, source_size) if include_source_size else result


def apply_edits(image: Image.Image, edit: AnyEditParameters) -> None:
    """Linear-sRGB v1: exposure, contrast around 18% gray, Rec.709 saturation.

    Work in 128-row stripes to avoid multiple full-resolution float arrays.
    Geometry stays unchanged. All request state is local; image is an owned copy.
    """
    if edit.exposure_ev == edit.contrast == edit.saturation == 0:
        return
    for top in range(0, image.height, 128):
        box = (0, top, image.width, min(top + 128, image.height))
        with image.crop(box) as stripe:
            pixels = np.asarray(stripe, dtype=np.float32) / 255.0
        linear = np.where(pixels <= 0.04045, pixels / 12.92, ((pixels + 0.055) / 1.055) ** 2.4)
        linear *= 2.0**edit.exposure_ev
        linear = (linear - 0.18) * (2.0 ** (edit.contrast / 100.0)) + 0.18
        luminance = np.sum(
            linear * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), axis=2, keepdims=True
        )
        linear = luminance + (linear - luminance) * (1.0 + edit.saturation / 100.0)
        np.clip(linear, 0, 1, out=linear)
        encoded = np.where(
            linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1.0 / 2.4) - 0.055
        )
        with Image.fromarray(np.rint(encoded * 255).astype(np.uint8)) as rendered:
            image.paste(rendered, (0, top))


def edited_jpeg(storage_key: str, edit: AnyEditParameters, *, max_side: int | None = None):
    with render_slot(), normalized_source(storage_key) as (image, source_hash):
        if isinstance(edit, EditParametersV2):
            with geometry_image(image, edit.geometry) as transformed:
                if max_side is not None:
                    transformed.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                apply_edits(transformed, edit)
                return encode_jpeg(transformed), transformed.size, source_hash
        if max_side is not None:
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        apply_edits(image, edit)
        return encode_jpeg(image), image.size, source_hash
