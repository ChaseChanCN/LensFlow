"""Health check endpoint tests."""

from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    """GET /health should return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "app" in data
    assert "env" in data
    assert "version" in data


def test_root_endpoint(client: TestClient):
    """GET / should return app info with docs link."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "app" in data
    assert data["docs"] == "/docs"


def test_docs_accessible(client: TestClient):
    """GET /docs should return Swagger UI HTML."""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


def test_error_format(client: TestClient):
    """Unknown route should return 404 in unified error format."""
    response = client.get("/nonexistent")
    assert response.status_code == 404
