"""Auth API tests: register, login, me, RBAC."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core.database import engine, get_db
from app.main import app
from app.models.base import Base

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestRegister:
    def test_register_client(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": "client@test.com",
                "password": "password123",
                "name": "Test Client",
                "role": "client",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "client@test.com"
        assert data["user"]["role"] == "client"

    def test_register_photographer(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": "photo@test.com",
                "password": "password123",
                "name": "Test Photographer",
                "role": "photographer",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["user"]["role"] == "photographer"

    def test_register_duplicate_email(self, client):
        payload = {
            "email": "dup@test.com",
            "password": "password123",
            "name": "Dup User",
            "role": "client",
        }
        client.post("/api/v1/auth/register", json=payload)
        resp = client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409

    def test_register_short_password(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": "short@test.com",
                "password": "12345",
                "name": "Short",
                "role": "client",
            },
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client):
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "login@test.com",
                "password": "password123",
                "name": "Login User",
                "role": "client",
            },
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "login@test.com", "password": "password123"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client):
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "wrong@test.com",
                "password": "password123",
                "name": "Wrong",
                "role": "client",
            },
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@test.com", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@test.com", "password": "password123"},
        )
        assert resp.status_code == 401


class TestMe:
    def test_get_me_with_token(self, client):
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "email": "me@test.com",
                "password": "password123",
                "name": "Me User",
                "role": "photographer",
            },
        )
        token = reg.json()["access_token"]
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@test.com"

    def test_get_me_without_token(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_get_me_invalid_token(self, client):
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalidtoken"},
        )
        assert resp.status_code == 401


class TestLogout:
    def test_logout_with_token(self, client):
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "email": "logout@test.com",
                "password": "password123",
                "name": "Logout User",
                "role": "client",
            },
        )
        token = reg.json()["access_token"]
        resp = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
