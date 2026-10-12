"""Selection and Retouch API tests: S5-T01 ~ S5-T07."""

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


def setup_order_with_photos(client, n_photos=3):
    """Create order with photos in WAITING_REVIEW state, return tokens + order_id + photo_ids."""
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
        json={"target_status": "WAITING_REVIEW", "action": "analyze_done"},
        headers=auth_headers(p_token),
    )

    return p_token, c_token, order_id, photo_ids


class TestSelectionSetCreate:
    def test_photographer_creates_selection_set(self, client):
        p_token, _, order_id, photo_ids = setup_order_with_photos(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["order_id"] == order_id
        assert data["max_select"] == 2
        assert len(data["items"]) == 3

    def test_order_transitions_to_waiting_selection(self, client):
        p_token, _, order_id, photo_ids = setup_order_with_photos(client)
        client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "WAITING_SELECTION"

    def test_client_cannot_create_selection_set(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 403

    def test_duplicate_selection_set_rejected(self, client):
        p_token, _, order_id, photo_ids = setup_order_with_photos(client)
        client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        resp = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 409

    def test_empty_photo_list_rejected(self, client):
        p_token, _, order_id, _ = setup_order_with_photos(client)
        resp = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": [], "max_select": 2},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 422


class TestSelectionSetView:
    def test_client_can_view_selection_set(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        resp = client.get(
            f"/api/v1/selection-sets/{ss_id}",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 3

    def test_get_selection_set_by_order(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        resp = client.get(
            f"/api/v1/orders/{order_id}/selection-set",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200


class TestSelectionSubmit:
    def test_client_submits_selection(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        resp = client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 201
        assert resp.json()["selection_set_id"] == ss_id

    def test_duplicate_submit_returns_409(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        resp = client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 409

    def test_exceed_max_select_rejected(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        resp = client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 422

    def test_submit_generates_retouch_tasks(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        tasks = client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        )
        assert tasks.status_code == 200
        assert len(tasks.json()) == 2

    def test_order_transitions_to_waiting_retouch(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "WAITING_RETOUCH"


class TestRetouchVersion:
    def test_photographer_uploads_preview(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        tasks = client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        ).json()
        task_id = tasks[0]["id"]

        resp = client.post(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            files={"file": ("preview.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201
        assert resp.json()["version_no"] == 1

    def test_version_number_increments(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        tasks = client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        ).json()
        task_id = tasks[0]["id"]

        v1 = client.post(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            files={"file": ("v1.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert v1.json()["version_no"] == 1
        v2 = client.post(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            files={"file": ("v2.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        assert v2.json()["version_no"] == 2

    def test_client_can_list_versions(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        tasks = client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        ).json()
        task_id = tasks[0]["id"]

        client.post(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            files={"file": ("v1.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )
        resp = client.get(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestRetouchFeedback:
    def test_client_submits_feedback(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )
        tasks = client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        ).json()
        task_id = tasks[0]["id"]

        client.post(
            f"/api/v1/retouch-tasks/{task_id}/versions",
            files={"file": ("v1.jpg", make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers(p_token),
        )

        resp = client.post(
            f"/api/v1/retouch-tasks/{task_id}/feedback",
            json={"content": "Please make it brighter"},
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 201
        assert resp.json()["content"] == "Please make it brighter"

    def test_client_confirms_retouch(self, client):
        p_token, c_token, order_id, photo_ids = setup_order_with_photos(client)
        create = client.post(
            f"/api/v1/orders/{order_id}/selection-set",
            json={"photo_ids": photo_ids, "max_select": 2},
            headers=auth_headers(p_token),
        )
        ss_id = create.json()["id"]
        client.post(
            f"/api/v1/selection-sets/{ss_id}/submit",
            json={"selected_photo_ids": photo_ids[:2]},
            headers=auth_headers(c_token),
        )

        for task in client.get(
            f"/api/v1/orders/{order_id}/retouch-tasks",
            headers=auth_headers(p_token),
        ).json():
            client.post(
                f"/api/v1/retouch-tasks/{task['id']}/versions",
                files={"file": ("v1.jpg", make_jpeg_bytes(), "image/jpeg")},
                headers=auth_headers(p_token),
            )

        resp = client.post(
            f"/api/v1/orders/{order_id}/confirm-retouch",
            headers=auth_headers(c_token),
        )
        assert resp.status_code == 200

        order = client.get(
            f"/api/v1/orders/{order_id}",
            headers=auth_headers(p_token),
        )
        assert order.json()["status"] == "WAITING_DELIVERY"
