"""Photo and Analysis API tests: S4-T01, S4-T02, S4-T05, S4-T06."""

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


def make_blurry_jpeg() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    img = cv2.GaussianBlur(img, (51, 51), 0)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def setup_order_at_waiting_upload(client):
    """Create a booking, confirm it, transition to WAITING_UPLOAD."""
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
    return p_token, c_token, order_id


class TestPhotoUpload:
    def test_upload_jpeg_success(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["photo"]["filename"] == "test.jpg"
        assert data["photo"]["mime"] == "image/jpeg"
        assert data["photo"]["width"] == 640
        assert data["photo"]["height"] == 480
        assert data["analysis_triggered"] is True

    def test_upload_rejects_non_jpeg(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("test.png", b"fake-png-data", "image/png")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 422

    def test_upload_rejects_empty_file(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 422

    def test_client_cannot_upload(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_upload(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403

    def test_upload_to_nonexistent_order(self, client):
        p_token, _, _ = setup_order_at_waiting_upload(client)
        resp = client.post(
            "/api/v1/orders/9999/photos",
            files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 404


class TestPhotoList:
    def test_list_photos_after_upload(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("a.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("b.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        resp = client.get(
            f"/api/v1/orders/{order_id}/photos",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_client_can_list_photos(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_upload(client)
        client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("a.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        resp = client.get(
            f"/api/v1/orders/{order_id}/photos",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestPhotoDelete:
    def test_delete_photo_in_analyzing_state(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_id = upload.json()["photo"]["id"]
        resp = client.delete(
            f"/api/v1/orders/{order_id}/photos/{photo_id}",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200

    def test_delete_nonexistent_photo(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        resp = client.delete(
            f"/api/v1/orders/{order_id}/photos/9999",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 404


class TestAnalysisResult:
    def test_get_analysis_after_upload(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("normal.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_id = upload.json()["photo"]["id"]

        resp = client.get(
            f"/api/v1/photos/{photo_id}/analysis",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photo_id"] == photo_id
        assert data["suggestion"] in ("no_issue", "need_review", "suggest_exclude")
        assert data["risk_level"] in ("low", "medium", "high")

    def test_get_analysis_not_found(self, client):
        p_token, _, _ = setup_order_at_waiting_upload(client)
        resp = client.get(
            "/api/v1/photos/9999/analysis",
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 404


class TestPhotographerReview:
    def test_review_mark_exclude(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("blurry.jpg", make_blurry_jpeg(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_id = upload.json()["photo"]["id"]

        analysis = client.get(
            f"/api/v1/photos/{photo_id}/analysis",
            headers=auth_headers(p_token),
        )
        analysis_id = analysis.json()["id"]

        resp = client.patch(
            f"/api/v1/analysis/{analysis_id}/review",
            json={"final_decision": "exclude", "note": "too blurry"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        assert resp.json()["reviewed"] is True
        assert resp.json()["final_decision"] == "exclude"

    def test_review_mark_keep(self, client):
        p_token, _, order_id = setup_order_at_waiting_upload(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("normal.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_id = upload.json()["photo"]["id"]
        analysis = client.get(
            f"/api/v1/photos/{photo_id}/analysis",
            headers=auth_headers(p_token),
        )
        analysis_id = analysis.json()["id"]

        resp = client.patch(
            f"/api/v1/analysis/{analysis_id}/review",
            json={"final_decision": "keep"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 200
        assert resp.json()["final_decision"] == "keep"

    def test_client_cannot_review(self, client):
        p_token, c_token, order_id = setup_order_at_waiting_upload(client)
        upload = client.post(
            f"/api/v1/orders/{order_id}/photos",
            files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        photo_id = upload.json()["photo"]["id"]
        analysis = client.get(
            f"/api/v1/photos/{photo_id}/analysis",
            headers=auth_headers(p_token),
        )
        analysis_id = analysis.json()["id"]

        resp = client.patch(
            f"/api/v1/analysis/{analysis_id}/review",
            json={"final_decision": "exclude"},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403

    def test_review_nonexistent_analysis(self, client):
        p_token, _, _ = setup_order_at_waiting_upload(client)
        resp = client.patch(
            "/api/v1/analysis/9999/review",
            json={"final_decision": "keep"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 404
