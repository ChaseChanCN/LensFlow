"""Private, content/version-addressed disk thumbnails. No background queue."""

import hashlib
import os
import re
import struct
import time
from io import BytesIO
from pathlib import Path
from threading import Lock
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.exceptions import AppException, ValidationException
from app.services.image_editor import normalized_source, render_slot, srgb_profile
from app.services.photo_edit_draft import source_fingerprint
from app.services.storage import LocalStorage, get_storage

RECIPE = "original-srgb-jpeg90-lanczos-v1"
VARIANTS = (128, 256, 512)
MAX_ENTRY_BYTES = 2 * 1024 * 1024
MAX_CACHE_BYTES = 128 * 1024 * 1024
MAX_CACHE_ENTRIES = 4096
TTL_SECONDS = 7 * 24 * 3600
_locks = [Lock() for _ in range(32)]
_maintenance = Lock()


def unavailable():
    raise AppException(
        "THUMBNAIL_CACHE_UNAVAILABLE", "Thumbnail cache unavailable", status_code=503
    )


def cache_root(storage):
    root = Path(storage.base_path)
    cache = root.with_name(root.name + ".lensflow-cache")
    if cache.is_symlink():
        unavailable()
    cache.mkdir(parents=True, exist_ok=True)
    return cache.resolve()


def cache_entry(root, key):
    if not re.fullmatch(r"[0-9a-f]{64}", key):
        unavailable()
    entry = root / (key + ".jpg")
    if entry.is_symlink() or entry.resolve().parent != root.resolve():
        unavailable()
    return entry


def stable_profile():
    # ICC creation time is metadata, not colorimetry; fix it for byte-stable recipes.
    profile = bytearray(srgb_profile())
    profile[24:36] = struct.pack(">6H", 2000, 1, 1, 0, 0, 0)
    profile[84:100] = bytes(16)
    return bytes(profile)


def read_cache(path, size):
    try:
        stat = path.stat()
        if time.time() - stat.st_mtime > TTL_SECONDS:
            path.unlink(missing_ok=True)
            return None
        if stat.st_size > MAX_ENTRY_BYTES:
            raise ValueError()
        content = path.read_bytes()
        if not content.endswith(b"\xff\xd9"):
            raise ValueError()
        with Image.open(BytesIO(content)) as image:
            if (
                image.format != "JPEG"
                or min(image.size) < 1
                or max(image.size) > size
                or image.info.get("icc_profile") != stable_profile()
            ):
                raise ValueError()
            image.load()  # Only the bounded thumbnail, never the original, is decoded on a hit.
        return content
    except FileNotFoundError:
        return None
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        path.unlink(missing_ok=True)
        return None


def prune_cache(root, incoming):
    now = time.time()
    entries = []
    total = 0
    for path in root.glob("*.jpg"):
        if not re.fullmatch(r"[0-9a-f]{64}\.jpg", path.name) or path.is_symlink():
            continue
        try:
            stat = path.stat()
            if now - stat.st_mtime > TTL_SECONDS:
                path.unlink(missing_ok=True)
            else:
                entries.append((stat.st_mtime, path, stat.st_size))
                total += stat.st_size
        except FileNotFoundError:
            continue
    entries.sort(key=lambda entry: entry[0])
    while entries and (total + incoming > MAX_CACHE_BYTES or len(entries) >= MAX_CACHE_ENTRIES):
        _, path, length = entries.pop(0)
        path.unlink(missing_ok=True)
        total -= length
    if incoming > MAX_CACHE_BYTES:
        unavailable()
    # Interrupted writes from old processes, never recent active publications.
    for path in root.glob(".*.tmp"):
        if re.fullmatch(r"\.[0-9a-f]{64}\.[0-9a-f]{32}\.tmp", path.name) and not path.is_symlink():
            try:
                if now - path.stat().st_mtime > 3600:
                    path.unlink(missing_ok=True)
            except FileNotFoundError:
                pass


def thumbnail(storage_key: str, size: int):
    if size not in VARIANTS:
        raise ValidationException("Unsupported thumbnail size")
    if settings.storage_type != "local":
        raise AppException(
            "THUMBNAIL_STORAGE_UNSUPPORTED",
            "Thumbnails require local binary storage",
            status_code=503,
        )
    try:
        storage = get_storage()
        if not isinstance(storage, LocalStorage):
            unavailable()
        source_hash = source_fingerprint(storage_key)
        key = hashlib.sha256(f"{storage_key}:{source_hash}:{size}:{RECIPE}".encode()).hexdigest()
        root = cache_root(storage)
        path = cache_entry(root, key)
        cached = read_cache(path, size)
        if cached is not None:
            return cached, "HIT"
        lock = _locks[int(key[:8], 16) % len(_locks)]
        if not lock.acquire(blocking=False):
            raise AppException(
                "THUMBNAIL_BUSY", "Thumbnail generation busy; retry later", status_code=429
            )
        try:
            cached = read_cache(path, size)
            if cached is not None:
                return cached, "HIT"
            with render_slot(), normalized_source(storage_key) as (image, actual_hash):
                if actual_hash != source_hash:
                    raise AppException(
                        "SOURCE_CHANGED",
                        "Source changed during thumbnail generation",
                        status_code=409,
                    )
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                with BytesIO() as output:
                    image.save(
                        output,
                        format="JPEG",
                        quality=90,
                        subsampling=0,
                        icc_profile=stable_profile(),
                        exif=b"",
                    )
                    content = output.getvalue()
            if not _maintenance.acquire(blocking=False):
                raise AppException(
                    "THUMBNAIL_BUSY", "Thumbnail cache publication busy", status_code=429
                )
            temporary = root / f".{key}.{uuid4().hex}.tmp"
            try:
                prune_cache(root, len(content))
                with temporary.open("xb") as stream:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
                _maintenance.release()
            return content, "MISS"
        finally:
            lock.release()
    except OSError:
        unavailable()
