import pytest

from app.core.database import SessionLocal
from app.models.user import User
from scripts.create_admin import AdminInput, provision_admin


@pytest.mark.parametrize("role", ["admin", "system", "Admin", "", None, 1, True])
def test_public_registration_rejects_privileged_or_invalid_roles(client, role):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "attack@test.com",
            "name": "Test",
            "password": "password123",
            "role": role,
        },
    )
    assert response.status_code == 422
    with SessionLocal() as db:
        assert db.query(User).count() == 0


@pytest.mark.parametrize("role", ["client", "photographer"])
def test_normal_registration_and_login_unchanged(client, role):
    payload = {
        "email": "ordinary@test.com",
        "name": "Test",
        "password": "password123",
        "role": role,
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    assert response.json()["user"]["role"] == role


def test_operator_provisioned_admin_can_login_without_public_admin_signup(client):
    with SessionLocal() as db:
        request = AdminInput(
            email="operator@test.com", name="Operator", password="controlled-secret-123"
        )
        provision_admin(db, request)
        from app.core.exceptions import ConflictException

        with pytest.raises(ConflictException):
            provision_admin(db, request)
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "operator@test.com",
            "password": "controlled-secret-123",
        },
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
