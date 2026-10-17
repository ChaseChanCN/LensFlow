"""Storage abstraction layer.

Provides a unified interface for file storage, supporting
local filesystem (dev) and Huawei OBS (prod).
"""

import os
from abc import ABC, abstractmethod
from contextlib import contextmanager
from pathlib import Path, PureWindowsPath
from uuid import uuid4

from app.core.config import settings
from app.core.exceptions import AppException, ValidationException


class Storage(ABC):
    @contextmanager
    def open_read(self, storage_key: str):
        """Backends must explicitly support authenticated binary reads."""
        raise AppException(
            "STORAGE_UNAVAILABLE", "Binary storage reads unavailable", status_code=503
        )
        yield  # pragma: no cover

    @abstractmethod
    def save(self, filename: str, content: bytes, content_type: str = "") -> str:
        """Save file content, return storage_key."""

    @abstractmethod
    def get_path(self, storage_key: str) -> str:
        """Get local file path or URL for the storage key."""

    @abstractmethod
    def delete(self, storage_key: str) -> bool:
        """Delete file, return True if deleted."""

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        """Check if file exists."""


class LocalStorage(Storage):
    def __init__(self, base_path: str | None = None):
        self.base_path = str(Path(base_path or settings.storage_local_path).resolve())
        os.makedirs(self.base_path, exist_ok=True)

    def save(self, filename: str, content: bytes, content_type: str = "") -> str:
        ext = os.path.splitext(filename)[1]
        storage_key = f"{uuid4().hex}{ext}"
        file_path = self.get_path(storage_key)
        with open(file_path, "xb") as f:
            f.write(content)
        return storage_key

    def get_path(self, storage_key: str) -> str:
        root = Path(self.base_path).resolve()
        if (
            not storage_key
            or "\\" in storage_key
            or "\x00" in storage_key
            or ":" in storage_key
            or PureWindowsPath(storage_key).drive
            or Path(storage_key).is_absolute()
            or ".." in Path(storage_key).parts
        ):
            raise ValidationException("Invalid storage key")
        target = (root / storage_key).resolve()
        if target == root or not target.is_relative_to(root):
            raise ValidationException("Invalid storage key")
        return str(target)

    @contextmanager
    def open_read(self, storage_key: str):
        with open(self.get_path(storage_key), "rb") as stream:
            yield stream

    def delete(self, storage_key: str) -> bool:
        file_path = self.get_path(storage_key)
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False

    def exists(self, storage_key: str) -> bool:
        return os.path.exists(self.get_path(storage_key))


def get_storage() -> Storage:
    """Factory: return storage instance based on config."""
    if settings.storage_type == "obs":
        return OBSStorage()
    return LocalStorage()


class OBSStorage(Storage):
    """Huawei Cloud OBS storage implementation."""

    def __init__(self):
        from obs import ObsClient  # type: ignore[import-untyped]

        self.client = ObsClient(
            access_key_id=settings.obs_ak,
            secret_access_key=settings.obs_sk,
            server=settings.obs_endpoint,
        )
        self.bucket = settings.obs_bucket

    def save(self, filename: str, content: bytes, content_type: str = "") -> str:
        ext = os.path.splitext(filename)[1]
        storage_key = f"{uuid4().hex}{ext}"
        self.client.putContent(self.bucket, storage_key, content)
        return storage_key

    def get_path(self, storage_key: str) -> str:
        return f"https://{self.bucket}.{settings.obs_endpoint}/{storage_key}"

    def delete(self, storage_key: str) -> bool:
        resp = self.client.deleteObject(self.bucket, storage_key)
        return resp.status < 300

    def exists(self, storage_key: str) -> bool:
        resp = self.client.headObject(self.bucket, storage_key)
        return resp.status < 300
