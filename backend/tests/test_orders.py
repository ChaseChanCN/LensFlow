"""Booking and Order API tests: S3-T01 ~ S3-T07."""

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


def register_user(client, email, role="client", name="Test"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "name": name, "role": role},
    )
    return resp.json()["access_token"], resp.json()["user"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


class TestBookingCreate:
    def test_client_create_booking(self, client):
        token, _ = register_user(client, "client1@test.com", "client")
        resp = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone:123"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "pending"
        assert resp.json()["shoot_type"] == "wedding"

    def test_photographer_cannot_create_booking(self, client):
        token, _ = register_user(client, "photo@test.com", "photographer")
        resp = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone:123"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    def test_list_bookings_as_client(self, client):
        token, _ = register_user(client, "client1@test.com", "client")
        client.post(
            "/api/v1/bookings",
            json={"shoot_type": "portrait", "contact_info": "email"},
            headers=auth_headers(token),
        )
        resp = client.get("/api/v1/bookings", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_booking_detail(self, client):
        token, _ = register_user(client, "client1@test.com", "client")
        create = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(token),
        )
        booking_id = create.json()["id"]
        resp = client.get(
            f"/api/v1/bookings/{booking_id}",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == booking_id


class TestBookingConfirm:
    def test_photographer_confirm_creates_order(self, client):
        client_token, client_user = register_user(client, "c@test.com", "client")
        photo_token, photo_user = register_user(client, "p@test.com", "photographer")

        create = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(client_token),
        )
        booking_id = create.json()["id"]

        resp = client.patch(
            f"/api/v1/bookings/{booking_id}/confirm",
            json={"photographer_id": photo_user["id"]},
            headers=auth_headers(photo_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

        orders = client.get("/api/v1/orders", headers=auth_headers(photo_token))
        assert len(orders.json()) == 1
        assert orders.json()[0]["status"] == "CONFIRMED"

    def test_client_cannot_confirm_booking(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        create = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        resp = client.patch(
            f"/api/v1/bookings/{create.json()['id']}/confirm",
            json={"photographer_id": 1},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403

    def test_cancel_booking(self, client):
        token, _ = register_user(client, "c@test.com", "client")
        create = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(token),
        )
        resp = client.patch(
            f"/api/v1/bookings/{create.json()['id']}/cancel",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"


class TestOrderStatus:
    def test_valid_status_transition(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )

        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]

        resp = client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_SHOOT", "action": "start_shoot"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "WAITING_SHOOT"

    def test_invalid_status_transition(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )

        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]

        resp = client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "DELIVERED", "action": "skip"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 409

    def test_role_permission_on_transition(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )

        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]

        resp = client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_SHOOT", "action": "test"},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403


class TestOrderTimeline:
    def test_timeline_records_transition(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )

        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]

        client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_SHOOT", "action": "start_shoot"},
            headers=auth_headers(p_token),
        )

        timeline = client.get(
            f"/api/v1/orders/{order_id}/timeline",
            headers=auth_headers(p_token),
        )
        assert timeline.status_code == 200
        assert len(timeline.json()) == 1
        assert timeline.json()[0]["to_status"] == "WAITING_SHOOT"


class TestTodoAutoGenerate:
    def test_todo_generated_on_status_change(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )

        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]

        client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_SHOOT", "action": "start"},
            headers=auth_headers(p_token),
        )
        client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_UPLOAD", "action": "shoot_done"},
            headers=auth_headers(p_token),
        )

        todos = client.get("/api/v1/todos", headers=auth_headers(p_token))
        assert todos.status_code == 200
        assert len(todos.json()) == 1
        assert todos.json()[0]["type"] == "upload_photos"

    def test_todo_mark_done(self, client):
        c_token, _ = register_user(client, "c@test.com", "client")
        p_token, p_user = register_user(client, "p@test.com", "photographer")

        booking = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(c_token),
        )
        client.patch(
            f"/api/v1/bookings/{booking.json()['id']}/confirm",
            json={"photographer_id": p_user["id"]},
            headers=auth_headers(p_token),
        )
        orders = client.get("/api/v1/orders", headers=auth_headers(p_token))
        order_id = orders.json()[0]["id"]
        client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_SHOOT", "action": "start"},
            headers=auth_headers(p_token),
        )
        client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"target_status": "WAITING_UPLOAD", "action": "done"},
            headers=auth_headers(p_token),
        )

        todos = client.get("/api/v1/todos", headers=auth_headers(p_token))
        todo_id = todos.json()[0]["id"]

        resp = client.patch(
            f"/api/v1/todos/{todo_id}",
            json={"done": True},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        assert resp.json()["done"] is True


class TestPermissionIsolation:
    def test_client_cannot_access_other_clients_booking(self, client):
        t1, _ = register_user(client, "c1@test.com", "client")
        t2, _ = register_user(client, "c2@test.com", "client")

        create = client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(t1),
        )
        resp = client.get(
            f"/api/v1/bookings/{create.json()['id']}",
            headers=auth_headers(t2),
        )
        assert resp.status_code == 200

    def test_client_cannot_see_other_orders(self, client):
        t1, _ = register_user(client, "c1@test.com", "client")
        t2, _ = register_user(client, "c2@test.com", "client")

        client.post(
            "/api/v1/bookings",
            json={"shoot_type": "wedding", "contact_info": "phone"},
            headers=auth_headers(t1),
        )
        orders = client.get("/api/v1/orders", headers=auth_headers(t2))
        assert len(orders.json()) == 0
