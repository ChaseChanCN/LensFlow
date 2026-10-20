"""Fail-closed isolation, established BEFORE importing any application module."""

import hashlib
import os
import secrets
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

_sandbox = tempfile.TemporaryDirectory(prefix="lensflow-pytest-")
TEST_ROOT = Path(_sandbox.name).resolve()
assert TEST_ROOT.is_relative_to(Path(tempfile.gettempdir()).resolve())
os.environ.update(
    {
        "DB_TYPE": "sqlite",
        "DB_SQLITE_PATH": (TEST_ROOT / "test.sqlite").as_posix(),
        "STORAGE_TYPE": "local",
        "STORAGE_LOCAL_PATH": (TEST_ROOT / "uploads").as_posix(),
        "APP_DEBUG": "false",
        "JWT_SECRET_KEY": secrets.token_urlsafe(48),
        "BARK_DEVICE_KEY": "",
        "WECHAT_WORK_WEBHOOK_URL": "",
        # Old business fixtures intentionally exercise the historical login contract.
        # SMS tests explicitly disable this flag and inject a capturing sender.
        "AUTH_LEGACY_PASSWORD_ENABLED": "true",
        "SMS_ENABLED": "false",
    }
)

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.base import Base  # noqa: E402

# If another import/plugin initialized the application too early, abort before
# collection can run legacy fixtures that call create_all/drop_all.
if Path(engine.url.database).resolve() != TEST_ROOT / "test.sqlite":
    raise RuntimeError("Refusing tests: application engine is not the isolated test database")
if SessionLocal.kw["bind"] is not engine:
    raise RuntimeError("Refusing tests: background session factory is not isolated")


def pytest_report_header(config):
    return f"ISOLATED SQLite: {engine.url.database}; storage sandbox: {TEST_ROOT}"


def pytest_configure(config):
    # Never let pytest's temporary-directory cleanup target a caller's data.
    config.option.basetemp = str(TEST_ROOT / "cases")


@pytest.fixture(autouse=True)
def isolated_resources(monkeypatch, tmp_path):
    """Each test gets its own uploads; legacy module DB fixtures remain safe."""
    with tempfile.TemporaryDirectory(dir=tmp_path, prefix="uploads-") as upload_dir:
        monkeypatch.setattr(settings, "storage_type", "local")
        monkeypatch.setattr(settings, "storage_local_path", upload_dir)
        Base.metadata.create_all(engine)
        try:
            yield
        finally:
            app.dependency_overrides.clear()
            Base.metadata.drop_all(engine)
    assert not Path(upload_dir).exists(), "Per-test upload cleanup failed"


@pytest.fixture(scope="session", autouse=True)
def guard_development_resources():
    """Read-only filesystem fingerprints; never connect to the development DB."""
    development = Path(__file__).resolve().parents[1] / "storage_local"

    def fingerprint():
        result = {}
        for path in development.rglob("*"):
            if path.is_file():
                with path.open("rb") as stream:
                    result[str(path.relative_to(development))] = hashlib.file_digest(
                        stream, "sha256"
                    ).hexdigest()
        return result

    before = fingerprint()
    yield
    assert fingerprint() == before, "Tests changed development database or uploads"


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    _sandbox.cleanup()
    if TEST_ROOT.exists():
        raise RuntimeError(f"Test sandbox cleanup failed: {TEST_ROOT}")


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def mock_notifier():
    """Mock notifier globally to prevent real HTTP calls and retry delays."""
    with patch("app.services.notification_service.get_notifier") as mock_get:
        mock_notifier = mock_get.return_value
        mock_notifier.send.return_value = None
        yield mock_notifier


pytest_plugins = ("tests.media_fixtures",)
