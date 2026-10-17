from pathlib import Path

import pytest

from app.core.exceptions import ValidationException
from app.services.storage import LocalStorage


@pytest.mark.parametrize(
    "key",
    [
        "../outside.jpg",
        "/outside.jpg",
        r"C:\outside.jpg",
        r"..\outside.jpg",
        "",
        "a/../../x",
        "\x00",
    ],
)
def test_rejects_escape(tmp_path, key):
    storage = LocalStorage(str(tmp_path / "uploads"))
    for operation in [storage.get_path, storage.delete, storage.exists]:
        with pytest.raises(ValidationException):
            operation(key)
    with pytest.raises(ValidationException), storage.open_read(key):
        pass


def test_read_is_binary_and_read_only(tmp_path):
    storage = LocalStorage(str(tmp_path / "uploads"))
    key = storage.save("source.jpg", b"original")
    with storage.open_read(key) as stream:
        assert stream.read() == b"original"
        assert not stream.writable()
    assert stream.closed
    assert Path(storage.get_path(key)).read_bytes() == b"original"


def test_symlink_cannot_escape(tmp_path):
    storage = LocalStorage(str(tmp_path / "uploads"))
    outside = tmp_path / "outside.jpg"
    outside.write_bytes(b"protected")
    try:
        (Path(storage.base_path) / "link.jpg").symlink_to(outside)
    except OSError:
        pytest.skip("OS does not permit test symlinks")
    with pytest.raises(ValidationException):
        storage.delete("link.jpg")
    assert outside.read_bytes() == b"protected"
