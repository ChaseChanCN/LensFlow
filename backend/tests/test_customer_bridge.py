"""Real JPEG and persisted domain tests; fixtures are isolated before app import."""

import hashlib
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from jose import jwt
from PIL import Image
from sqlalchemy import event

from app.core.config import settings
from app.core.security import create_access_token
from app.models.booking import Booking
from app.models.customer_bridge import BookingRequestKey, CustomerSelectionDraft
from app.models.delivery import Delivery
from app.models.order import Order, OrderTimeline
from app.models.photo import Photo
from app.models.retouch import RetouchTask
from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
from app.services import customer_media
from app.services.customer_workflow import utcnow
from tests.media_fixtures import SAMPLE


def headers(user):
    return {"Authorization": "Bearer " + create_access_token(str(user.id))}


@pytest.fixture
def bridge_case(jpeg_case):
    db, users, order, photo, storage, _ = jpeg_case
    order.status = "WAITING_SELECTION"
    extra = Photo(
        order_id=order.id,
        filename="offered.jpg",
        storage_key=photo.storage_key,
        mime="image/jpeg",
        size_bytes=photo.size_bytes,
    )
    private = Photo(
        order_id=order.id,
        filename="private.jpg",
        storage_key=photo.storage_key,
        mime="image/jpeg",
        size_bytes=photo.size_bytes,
    )
    foreign_order = Order(
        booking_id=2, client_id=users[3].id, photographer_id=users[1].id, status="WAITING_SELECTION"
    )
    db.add_all([extra, private, foreign_order])
    db.flush()
    foreign = Photo(
        order_id=foreign_order.id,
        filename="foreign.jpg",
        storage_key=photo.storage_key,
        mime="image/jpeg",
        size_bytes=1,
    )
    selection = SelectionSet(order_id=order.id, max_select=2, published_at=utcnow())
    db.add_all([selection, foreign])
    db.flush()
    db.add_all(
        [SelectionItem(selection_set_id=selection.id, photo_id=p.id) for p in [photo, extra]]
    )
    delivery = Delivery(order_id=order.id, storage_key=photo.storage_key, filename="真实成片.jpg")
    task = RetouchTask(order_id=order.id, photo_id=photo.id, status="pending")
    db.add_all([delivery, task])
    db.commit()
    customer_media._rate.clear()
    return db, users, order, photo, extra, private, foreign, selection, delivery, task, storage


def test_identity_auth_and_safe_order_projection(client, bridge_case):
    db, users, order, *_ = bridge_case
    assert client.get("/api/v1/customer/orders").status_code == 401
    assert client.get("/api/v1/customer/orders", headers=headers(users[0])).status_code == 403
    result = client.get("/api/v1/customer/orders", headers=headers(users[2]))
    assert result.status_code == 200
    item = result.json()["items"][0]
    assert set(item) == {
        "id",
        "status",
        "created_at",
        "updated_at",
        "booking",
        "selection_available",
        "delivery_available",
    }
    assert item["id"] == order.id and item["selection_available"] and not item["delivery_available"]
    assert item["created_at"].endswith("Z")
    assert "no-store" in result.headers["cache-control"]
    assert (
        client.get(f"/api/v1/customer/orders/{order.id}", headers=headers(users[3])).status_code
        == 403
    )


def test_order_and_photo_sql_pagination_no_n_plus_one(client, bridge_case):
    db, users, order, photo, *_ = bridge_case
    db.add_all(
        [
            Order(
                booking_id=1, client_id=users[2].id, photographer_id=users[0].id, status="CONFIRMED"
            )
            for _ in range(53)
        ]
    )
    db.commit()
    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        result = client.get("/api/v1/customer/orders?limit=50", headers=headers(users[2]))
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    assert result.status_code == 200
    body = result.json()
    assert len(body["items"]) == 50
    assert len(statements) <= 3 and any("LIMIT" in sql for sql in statements)
    second = client.get(
        f"/api/v1/customer/orders?limit=50&after={body['next_after']}", headers=headers(users[2])
    ).json()
    assert len(second["items"]) == 4 and second["next_after"] is None
    assert (
        client.get("/api/v1/customer/orders?limit=51", headers=headers(users[2])).status_code == 422
    )
    first = client.get(
        f"/api/v1/customer/orders/{order.id}/photos?limit=1", headers=headers(users[2])
    ).json()
    assert first["items"][0]["id"] == photo.id and first["next_after"] == photo.id
    assert set(first["items"][0]) == {
        "id",
        "order_id",
        "width",
        "height",
        "selected",
        "thumbnail_available",
        "preview_available",
    }
    last = client.get(
        f"/api/v1/customer/orders/{order.id}/photos?after={first['next_after']}",
        headers=headers(users[2]),
    ).json()
    assert len(last["items"]) == 1 and last["next_after"] is None


def test_booking_retry_recovery_mismatch_and_scope(client, bridge_case):
    db, users, *_ = bridge_case
    body = {
        "shoot_type": "portrait",
        "preferred_date": "2026-12-31",
        "contact_info": "123",
        "photographer_id": users[0].id,
    }
    request_headers = {**headers(users[2]), "Idempotency-Key": "customer-booking-001"}
    a = client.post("/api/v1/bookings", json=body, headers=request_headers)
    b = client.post("/api/v1/bookings", json=body, headers=request_headers)
    assert a.status_code == b.status_code == 201 and a.json()["id"] == b.json()["id"]
    assert db.query(Booking).count() == db.query(BookingRequestKey).count() == 1
    for invalid in ["2026-12-31T00:00:00Z", 0]:
        assert (
            client.post(
                "/api/v1/bookings",
                json={**body, "preferred_date": invalid},
                headers=headers(users[2]),
            ).status_code
            == 422
        )
    assert (
        client.post(
            "/api/v1/bookings", json={**body, "shoot_type": "wedding"}, headers=request_headers
        ).status_code
        == 409
    )
    c = client.post(
        "/api/v1/bookings",
        json=body,
        headers={**headers(users[3]), "Idempotency-Key": "customer-booking-001"},
    )
    assert c.status_code == 201 and c.json()["id"] != a.json()["id"]
    assert (
        client.get("/api/v1/customer/bookings", headers=headers(users[2])).json()["items"][0][
            "status"
        ]
        == "pending"
    )
    key = db.query(BookingRequestKey).filter_by(user_id=users[2].id).one()
    key.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    newer = client.post("/api/v1/bookings", json=body, headers=request_headers)
    assert newer.json()["id"] != a.json()["id"]


@pytest.mark.parametrize(
    "route,method",
    [
        ("bookings/{id}", "get"),
        ("bookings/{id}/cancel", "patch"),
        ("bookings/{id}/confirm", "patch"),
    ],
)
def test_booking_legacy_access_boundaries(client, bridge_case, route, method):
    db, users, *_ = bridge_case
    booking = Booking(
        client_id=users[2].id,
        photographer_id=users[0].id,
        shoot_type="portrait",
        contact_info="123",
        status="pending",
    )
    db.add(booking)
    db.commit()
    actor = users[1] if "confirm" in route else users[3]
    kwargs = {"json": {"photographer_id": actor.id}} if "confirm" in route else {}
    assert (
        getattr(client, method)(
            "/api/v1/" + route.format(id=booking.id), headers=headers(actor), **kwargs
        ).status_code
        == 403
    )


def test_selection_operations_cas_web_coexistence_and_submission(client, bridge_case):
    db, users, order, photo, extra, _, _, selection, _, _, _ = bridge_case
    h = headers(users[2])
    url = f"/api/v1/customer/orders/{order.id}/selection"
    assert client.get(url, headers=h).json()["revision"] == 0

    def write(rev, ids, operation="replace"):
        return client.put(
            url,
            json={"expected_revision": rev, "selected_photo_ids": ids, "operation": operation},
            headers=h,
        )

    assert write(0, [photo.id]).json()["revision"] == 1
    conflict = write(0, [extra.id])
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current"]["selected_photo_ids"] == [photo.id]
    legacy = client.get(f"/api/v1/selection-sets/{selection.id}", headers=h).json()
    assert legacy["revision"] == 1 and legacy["draft_selected_photo_ids"] == [photo.id]
    assert (
        client.post(
            f"/api/v1/selection-sets/{selection.id}/submit",
            json={"selected_photo_ids": [extra.id]},
            headers=h,
        ).status_code
        == 409
    )
    assert write(1, [extra.id], "add").json()["revision"] == 2
    assert write(2, [photo.id], "remove").json()["selected_photo_ids"] == [extra.id]
    final = client.post(url + "/submit", json={"expected_revision": 3}, headers=h)
    assert (
        final.status_code == 200
        and final.json()["status"] == "submitted"
        and final.json()["revision"] == 4
    )
    retry = client.post(url + "/submit", json={"expected_revision": 3}, headers=h)
    assert retry.status_code == 200 and retry.json() == final.json()
    db.expire_all()
    assert db.get(Order, order.id).status == "WAITING_RETOUCH"
    assert db.query(SelectionSubmission).count() == 1
    assert db.query(OrderTimeline).filter_by(action="submit_selection").count() == 1
    assert db.query(RetouchTask).filter_by(photo_id=extra.id).count() == 1
    assert write(4, []).status_code == 409


@pytest.mark.parametrize(
    "case", ["duplicate", "cross_order", "private", "quota", "bool", "unknown", "negative"]
)
def test_selection_validation(client, bridge_case, case):
    db, users, order, photo, extra, private, foreign, selection, *_ = bridge_case
    body = {"expected_revision": 0, "selected_photo_ids": [photo.id]}
    body.update(
        {
            "duplicate": {"selected_photo_ids": [photo.id, photo.id]},
            "cross_order": {"selected_photo_ids": [foreign.id]},
            "private": {"selected_photo_ids": [private.id]},
            "quota": {"selected_photo_ids": [photo.id, extra.id]},
            "bool": {"expected_revision": True},
            "unknown": {"user_id": users[3].id},
            "negative": {"selected_photo_ids": [-1]},
        }[case]
    )
    if case == "quota":
        selection.max_select = 1
        db.commit()
    result = client.put(
        f"/api/v1/customer/orders/{order.id}/selection", json=body, headers=headers(users[2])
    )
    assert result.status_code == 422
    assert db.query(CustomerSelectionDraft).count() == 0


def test_selection_expiry_publication_and_empty_submit(client, bridge_case):
    db, users, order, photo, _, _, _, selection, *_ = bridge_case
    url = f"/api/v1/customer/orders/{order.id}/selection"
    h = headers(users[2])
    assert client.post(url + "/submit", json={"expected_revision": 0}, headers=h).status_code == 422
    selection.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert not client.get(url, headers=h).json()["editable"]
    assert (
        client.put(
            url, json={"expected_revision": 0, "selected_photo_ids": [photo.id]}, headers=h
        ).status_code
        == 409
    )
    selection.published_at = None
    db.commit()
    assert client.get(url, headers=h).status_code == 404


def grant(client, user, media_id, kind="photo", variant="thumbnail", size=256):
    body = {"kind": kind, "media_id": media_id, "variant": variant, "size": size}
    return client.post("/api/v1/customer/media-grants", json=body, headers=headers(user))


def redeem(client, token, suffix=""):
    return client.get(
        "/api/v1/customer/media" + suffix, headers={"Authorization": "MediaGrant " + token}
    )


def test_real_media_preview_reuse_scope_and_original_immutability(client, bridge_case):
    db, users, order, photo, extra, private, foreign, *_ = bridge_case
    with customer_media.source_stream(photo.storage_key) as stream:
        before = hashlib.file_digest(stream, "sha256").hexdigest()
    g = grant(client, users[2], photo.id)
    assert g.status_code == 201
    body = g.json()
    assert body["download_path"] == "/api/v1/customer/media" and body["reusable"]
    token = body["token"]
    for _ in range(2):
        r = redeem(client, token)
        assert r.status_code == 200
        with Image.open(BytesIO(r.content)) as image:
            assert image.format == "JPEG" and max(image.size) <= 256 and not image.getexif()
    assert (
        "storage_key" not in jwt.get_unverified_claims(token) and "?" not in body["download_path"]
    )
    assert redeem(client, token, "?size=1024").status_code == 422
    assert redeem(client, token + "x").status_code == 401
    assert grant(client, users[2], private.id).status_code == 404
    assert grant(client, users[2], foreign.id).status_code == 403
    assert grant(client, users[2], photo.id, variant="download", size=None).status_code == 422
    preview = grant(client, users[2], photo.id, variant="preview", size=1024)
    assert redeem(client, preview.json()["token"]).status_code == 200
    with customer_media.source_stream(photo.storage_key) as stream:
        assert (
            hashlib.file_digest(stream, "sha256").hexdigest()
            == before
            == hashlib.sha256(SAMPLE.read_bytes()).hexdigest()
        )


@pytest.mark.parametrize(
    "revocation",
    ["expired", "disabled", "owner", "cancelled", "unpublished", "replacement", "deleted"],
)
def test_grant_expiry_and_immediate_revocation(client, bridge_case, revocation):
    db, users, order, photo, _, _, _, selection, *_ = bridge_case
    token = grant(client, users[2], photo.id).json()["token"]
    if revocation == "expired":
        claims = jwt.get_unverified_claims(token)
        claims["exp"] = 1
        token = jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256")
    elif revocation == "disabled":
        users[2].is_active = False
    elif revocation == "owner":
        order.client_id = users[3].id
    elif revocation == "cancelled":
        order.status = "CANCELLED"
    elif revocation == "unpublished":
        selection.published_at = None
    elif revocation == "replacement":
        photo.storage_key = "replaced.jpg"
    elif revocation == "deleted":
        db.delete(photo)
    db.commit()
    assert redeem(client, token).status_code in (401, 403, 404)


def test_media_limits_and_missing_storage(client, bridge_case):
    db, users, order, photo, *_ = bridge_case
    for _ in range(60):
        customer_media.admission(users[2].id)
    assert grant(client, users[2], photo.id).status_code == 429
    customer_media._rate.clear()
    token = grant(client, users[2], photo.id).json()["token"]
    acquired = [customer_media._slots.acquire(False) for _ in range(4)]
    assert all(acquired)
    try:
        assert redeem(client, token).status_code == 429
    finally:
        for _ in acquired:
            customer_media._slots.release()
    storage = bridge_case[-1]
    existing = set(Path(storage.base_path).iterdir())
    original_open = open

    class FailedWriter:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.stream.close()

        def write(self, content):
            self.stream.write(content[:16])
            raise OSError("simulated disk failure")

    def broken_open(path, mode):
        writer = FailedWriter()
        writer.stream = original_open(path, mode)
        return writer

    with patch("app.services.storage.open", broken_open, create=True):
        with pytest.raises(OSError):
            storage.save("partial.jpg", SAMPLE.read_bytes())
    assert set(Path(storage.base_path).iterdir()) == existing
    storage.delete(photo.storage_key)
    assert redeem(client, token).status_code == 404


def test_delivery_publication_stream_bytes_revocation_and_safe_legacy(client, bridge_case):
    db, users, order, photo, _, _, _, _, delivery, *_ = bridge_case
    h = headers(users[2])
    url = f"/api/v1/customer/orders/{order.id}/deliveries"
    assert client.get(url, headers=h).json()["items"] == []
    assert grant(client, users[2], delivery.id, "delivery", "download", None).status_code == 404
    order.status = "DELIVERED"
    db.commit()
    item = client.get(url, headers=h).json()["items"][0]
    assert item["size_bytes"] == len(SAMPLE.read_bytes()) and item["media_type"] == "image/jpeg"
    assert item["preview_available"] and "storage_key" not in item
    legacy = client.get(f"/api/v1/orders/{order.id}/delivery", headers=h)
    assert legacy.status_code == 200 and "storage_key" not in legacy.json()
    token = grant(client, users[2], delivery.id, "delivery", "download", None).json()["token"]
    r = redeem(client, token)
    assert (
        r.status_code == 200
        and r.content == SAMPLE.read_bytes()
        and "no-store" in r.headers["cache-control"]
    )
    assert int(r.headers["content-length"]) == len(r.content)
    assert (
        redeem(
            client,
            grant(client, users[2], delivery.id, "delivery", "preview", 1024).json()["token"],
        ).status_code
        == 200
    )
    order.status = "CANCELLED"
    db.commit()
    assert redeem(client, token).status_code == 404
    assert client.get(f"/api/v1/deliveries/{delivery.id}/download", headers=h).status_code == 404
    # A failed SQL commit cannot publish the order or orphan a final upload.
    from sqlalchemy.exc import OperationalError

    order.status = "WAITING_DELIVERY"
    db.commit()
    storage = bridge_case[-1]
    before_files = set(Path(storage.base_path).iterdir())
    with patch(
        "sqlalchemy.orm.Session.commit",
        side_effect=OperationalError("private SQL", {}, Exception("private path")),
    ):
        failed = client.post(
            f"/api/v1/orders/{order.id}/delivery",
            headers=headers(users[0]),
            files={"file": ("failed.jpg", SAMPLE.read_bytes(), "image/jpeg")},
        )
        assert (
            failed.status_code == 503
            and "private SQL" not in failed.text
            and "private path" not in failed.text
        )
    assert set(Path(storage.base_path).iterdir()) == before_files
    db.expire_all()
    assert db.get(Order, order.id).status == "WAITING_DELIVERY"


@pytest.mark.parametrize(
    "endpoint",
    [
        "orders/{order}",
        "orders/{order}/timeline",
        "orders/{order}/selection-set",
        "selection-sets/{selection}",
        "selection-sets/{selection}/submission",
        "orders/{order}/retouch-tasks",
        "retouch-tasks/{task}/versions",
        "retouch-tasks/{task}/feedback",
        "orders/{order}/delivery",
    ],
)
def test_cross_customer_legacy_routes(client, bridge_case, endpoint):
    db, users, order, photo, _, _, _, selection, delivery, task, _ = bridge_case
    url = "/api/v1/" + endpoint.format(order=order.id, selection=selection.id, task=task.id)
    assert client.get(url, headers=headers(users[3])).status_code == 403


def test_customer_cannot_skip_selection_or_see_private_storage(client, bridge_case):
    db, users, order, photo, *_ = bridge_case
    assert (
        client.patch(
            f"/api/v1/orders/{order.id}/status",
            json={"target_status": "WAITING_RETOUCH", "action": "skip"},
            headers=headers(users[2]),
        ).status_code
        == 409
    )
    r = client.get(f"/api/v1/orders/{order.id}/photos", headers=headers(users[2]))
    assert r.status_code == 200 and all("storage_key" not in p for p in r.json())
    assert (
        client.get(
            "/api/v1/customer/orders",
            headers={"Authorization": "Bearer " + create_access_token("not-a-number")},
        ).status_code
        == 401
    )
    task = bridge_case[-2]
    assert (
        client.post(
            f"/api/v1/orders/{order.id}/selection-set",
            headers=headers(users[1]),
            json={"photo_ids": [photo.id]},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/orders/{order.id}/delivery",
            headers=headers(users[1]),
            files={"file": ("foreign.jpg", SAMPLE.read_bytes(), "image/jpeg")},
        ).status_code
        == 403
    )
    assert (
        client.patch(f"/api/v1/orders/{order.id}/archive", headers=headers(users[1])).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/retouch-tasks/{task.id}/versions",
            headers=headers(users[1]),
            files={"file": ("foreign.jpg", SAMPLE.read_bytes(), "image/jpeg")},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/retouch-tasks/{task.id}/status",
            headers=headers(users[3]),
            json={"status": "confirmed"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/retouch-tasks/{task.id}/feedback",
            headers=headers(users[3]),
            json={"content": "foreign"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/orders/{order.id}/confirm-retouch", headers=headers(users[3])
        ).status_code
        == 403
    )
