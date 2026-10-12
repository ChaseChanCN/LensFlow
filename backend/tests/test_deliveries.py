"""Delivery and Notification API tests: S6-T01 ~ S6-T05."""

import cv2
import numpy as np
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


def make_jpeg_bytes() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def setup_order_at_waiting_delivery(client):
    """Create order through full flow to WAITING_DELIVERY state."""
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

    upload = client.post(
        f"/api/v1/orders/{order_id}/photos",
        files={"file": ("photo.jpg", make_jpeg_bytes(), "image/jpeg")},
        headers=auth_headers(p_token),
    )
    photo_id = upload.json()["photo"]["id"]

    client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"target_status": "WAITING_REVIEW", "action": "done"},
        headers=auth_headers(p_token),
    )

    ss = client.post(
        f"/api/v1/orders/{order_id}/selection-set",
        json={"photo_ids": [photo_id], "max_select": 1},
        headers=auth_headers(p_token),
    )
    ss_id = ss.json()["id"]

    client.post(
        f"/api/v1/selection-sets/{ss_id}/submit",
        json={"selected_photo_ids": [photo_id]},
        headers=auth_headers(c_token),
    )

    tasks = client.get(
        f"/api/v1/orders/{order_id}/retouch-tasks",
        headers=auth_headers(p_token),
    ).json()
    for task in tasks:
        client.post(
            f"/api/v1/retouch-tasks/{task['id']}/versions",
            files={"file": ("v1.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )

    client.post(
        f"/api/v1/orders/{order_id}/confirm-retouch",
        headers=auth_headers(c_token),
    )

    return p_token, c_token, order_id


class TestDeliveryUpload:
    def test_photographer_uploads_delivery(self, client):
        p_token, _, order_id = setup_order_at_waiting_delivery(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201
        assert resp.json()["order_id"] == order_id
        assert resp.json()["filename"] == "final.zip"

    def test_order_transitions_to_delivered(self, client):
        p_token, _, order_id = setup_order_at_waiting_delivery(client)
        client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "DELIVERED"

    def test_client_cannot_upload_delivery(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_delivery(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403

    def test_upload_delivery_wrong_state(self, client):
        p_token, p_user = register_user(client, "p3@test.com", "photographer")
        c_token, c_user = register_user(client, "c3@test.com", "client")
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
        resp = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 409


class TestDeliveryDownload:
    def test_client_can_download(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_delivery(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        delivery_id = upload.json()["id"]
        resp = client.get(
            f"/api/v1/deliveries/{delivery_id}/download",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200

    def test_photographer_can_download(self, client):
        p_token, _, order_id = setup_order_at_waiting_delivery(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        delivery_id = upload.json()["id"]
        resp = client.get(
            f"/api/v1/deliveries/{delivery_id}/download",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200

    def test_non_participant_cannot_download(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_delivery(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        delivery_id = upload.json()["id"]

        other_token, _ = register_user(client, "other@test.com", "client")
        resp = client.get(
            f"/api/v1/deliveries/{delivery_id}/download",
            headers=auth_headers(other_token),
        )
        assert resp.status_code == 403

    def test_get_delivery_info(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_delivery(client)
        client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        resp = client.get(
            f"/api/v1/orders/{order_id}/delivery",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200
        assert resp.json()["filename"] == "final.zip"


class TestOrderArchive:
    def test_photographer_archives_order(self, client):
        p_token, _, order_id = setup_order_at_waiting_delivery(client)
        client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        resp = client.patch(
            f"/api/v1/orders/{order_id}/archive",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200

        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "ARCHIVED"

    def test_cannot_archive_non_delivered(self, client):
        p_token, p_user = register_user(client, "p5@test.com", "photographer")
        c_token, c_user = register_user(client, "c5@test.com", "client")
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
            f"/api/v1/orders/{order_id}/archive",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 409


class TestNotificationDecoupling:
    """S6-T02: Notification failure must not affect state transitions."""

    def test_selection_published_with_notification_failure(self, client, mock_notifier):
        mock_notifier.send.side_effect = Exception("Notification service down")

        p_token, _, order_id, photo_ids = _setup_order_with_photos(client)

        resp = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 1},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201

        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "WAITING_SELECTION"

    def test_delivery_with_notification_failure(self, client, mock_notifier):
        p_token, c_token, order_id = setup_order_at_waiting_delivery(client)

        mock_notifier.send.side_effect = Exception("Notification service down")

        resp = client.post(
            f"/api/v1/orders/{order_id}/delivery",
            files={"file": ("final.zip", b"fake-zip-data", "application/zip")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201

        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "DELIVERED"


def _setup_order_with_photos(client, n_photos=1):
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
    photo_ids = []
    for i in range(n_photos):
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": (f"photo{i}.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_ids.append(upload.json()["photo"]["id"])
    client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"target_status": "WAITING_REVIEW", "action": "done"},
        headers=auth_headers(p_token),
    )
    return p_token, c_token, order_id, photo_ids
