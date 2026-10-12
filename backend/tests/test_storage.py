"""Storage abstraction layer tests."""

import os
import tempfile

import pytest

from app.services.storage import LocalStorage


@pytest.fixture
def storage():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield LocalStorage(base_path=tmpdir)


class TestLocalStorage:
    def test_save_and_exists(self, storage):
        key = storage.save("test.jpg", b"fake image content", "image/jpeg")
        assert storage.exists(key) is True

    def test_save_returns_unique_key(self, storage):
        key1 = storage.save("test.jpg", b"content1")
        key2 = storage.save("test.jpg", b"content2")
        assert key1 != key2

    def test_save_preserves_extension(self, storage):
        key = storage.save("photo.png", b"content")
        assert key.endswith(".png")

    def test_get_path(self, storage):
        key = storage.save("test.jpg", b"content")
        path = storage.get_path(key)
        assert os.path.exists(path)

    def test_delete(self, storage):
        key = storage.save("test.jpg", b"content")
        assert storage.delete(key) is True
        assert storage.exists(key) is False

    def test_delete_nonexistent(self, storage):
        assert storage.delete("nonexistent.jpg") is False

    def test_exists_nonexistent(self, storage):
        assert storage.exists("nonexistent.jpg") is False

    def test_save_large_content(self, storage):
        content = b"x" * (5 * 1024 * 1024)
        key = storage.save("large.jpg", content)
        assert storage.exists(key) is True
        path = storage.get_path(key)
        assert os.path.getsize(path) == 5 * 1024 * 1024
