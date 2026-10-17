"""These checks do not open or mutate the development database."""

from pathlib import Path

from app.api.v1 import photos
from app.core.config import settings
from app.core.database import engine
from app.services.storage import get_storage
from tests.conftest import TEST_ROOT


def test_database_and_background_factory_are_temporary():
    assert Path(engine.url.database).resolve().is_relative_to(TEST_ROOT)
    assert photos.SessionLocal.kw["bind"] is engine
    assert Path(settings.db_sqlite_path).resolve().is_relative_to(TEST_ROOT)


def test_storage_is_per_test_and_not_development(tmp_path):
    storage = get_storage()
    assert Path(storage.base_path).resolve().is_relative_to(tmp_path)
    key = storage.save("isolation.jpg", b"test")
    assert Path(storage.get_path(key)).is_file()


def test_notifications_cannot_reach_network(mock_notifier):
    from app.services.notification_service import get_notifier

    assert get_notifier() is mock_notifier
