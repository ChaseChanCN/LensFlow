"""Notification abstraction layer tests."""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.database import engine
from app.models.base import Base
from app.services.notifier import BarkNotifier

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def mock_bark_config():
    from app.core.config import settings
    original = settings.bark_device_key
    settings.bark_device_key = "test_device_key"
    yield
    settings.bark_device_key = original


@pytest.fixture
def db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


class TestBarkNotifier:
    @patch("app.services.notifier.httpx.post")
    def test_send_success(self, mock_post, db):
        mock_post.return_value = MagicMock(
            json=lambda: {"code": 200, "message": "success"},
            raise_for_status=lambda: None,
        )

        notifier = BarkNotifier()
        log = notifier.send(db, title="Test", body="Hello", target="device123")

        assert log.status == "sent"
        assert log.retry_count == 0
        assert log.channel == "BarkNotifier"
        mock_post.assert_called_once()

    @patch("app.services.notifier.httpx.post")
    @patch("app.services.notifier.time.sleep")
    def test_send_failure_with_retry(self, mock_sleep, mock_post, db):
        mock_post.side_effect = Exception("Network error")

        notifier = BarkNotifier()
        log = notifier.send(db, title="Test", body="Hello", target="device123")

        assert log.status == "failed"
        assert log.retry_count == 3
        assert "Network error" in (log.error_message or "")
        assert mock_post.call_count == 3

    @patch("app.services.notifier.httpx.post")
    @patch("app.services.notifier.time.sleep")
    def test_send_retry_then_success(self, mock_sleep, mock_post, db):
        mock_post.side_effect = [
            Exception("Network error"),
            MagicMock(
                json=lambda: {"code": 200},
                raise_for_status=lambda: None,
            ),
        ]

        notifier = BarkNotifier()
        log = notifier.send(db, title="Test", body="Hello", target="device123")

        assert log.status == "sent"
        assert log.retry_count == 1
        assert mock_post.call_count == 2

    def test_send_logs_to_db(self, db):
        with patch("app.services.notifier.httpx.post") as mock_post:
            mock_post.return_value = MagicMock(
                json=lambda: {"code": 200},
                raise_for_status=lambda: None,
            )
            notifier = BarkNotifier()
            log = notifier.send(
                db,
                title="Booking Confirmed",
                body="Your booking is confirmed",
                target="device123",
                template="booking_confirm",
                related_order_id=42,
            )

        assert log.id is not None
        assert log.template == "booking_confirm"
        assert log.related_order_id == 42
        assert "Booking Confirmed" in log.payload

    @patch("app.services.notifier.httpx.post")
    def test_notification_does_not_raise(self, mock_post, db):
        """Notification failure should not raise, only log."""
        mock_post.side_effect = Exception("Total failure")

        notifier = BarkNotifier()
        log = notifier.send(db, title="Test", body="Hello", target="device123")

        assert log.status == "failed"
