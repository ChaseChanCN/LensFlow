"""Pytest configuration and fixtures."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def mock_notifier():
    """Mock notifier globally to prevent real HTTP calls and retry delays."""
    with patch("app.services.notification_service.get_notifier") as mock_get:
        mock_notifier = mock_get.return_value
        mock_notifier.send.return_value = None
        yield mock_notifier
