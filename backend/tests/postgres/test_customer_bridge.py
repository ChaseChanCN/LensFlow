"""D2 contract reused against migrated, launcher-owned real PostgreSQL."""

# ruff: noqa: F811 -- imported pytest fixtures are injected as function arguments

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from tests.media_fixtures import access_case, jpeg_case  # noqa: F401
from tests.test_customer_bridge import (  # noqa: F401
    bridge_case,
    headers,
    test_booking_legacy_access_boundaries,
    test_booking_retry_recovery_mismatch_and_scope,
    test_cross_customer_legacy_routes,
    test_customer_cannot_skip_selection_or_see_private_storage,
    test_delivery_publication_stream_bytes_revocation_and_safe_legacy,
    test_grant_expiry_and_immediate_revocation,
    test_identity_auth_and_safe_order_projection,
    test_media_limits_and_missing_storage,
    test_order_and_photo_sql_pagination_no_n_plus_one,
    test_real_media_preview_reuse_scope_and_original_immutability,
    test_selection_expiry_publication_and_empty_submit,
    test_selection_operations_cas_web_coexistence_and_submission,
    test_selection_validation,
)

pytestmark = pytest.mark.postgres


@pytest.fixture(autouse=True)
def migrated(pg_database):
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        yield client


def test_new_constraints_cascade_and_rollback(bridge_case):
    from app.models.booking import Booking
    from app.models.customer_bridge import BookingRequestKey, CustomerSelectionDraft
    from app.services.customer_workflow import utcnow

    db, users, order, photo, _, _, _, selection, *_ = bridge_case
    assert db.scalar(text("SHOW TimeZone")) == "UTC"
    for state in [
        CustomerSelectionDraft(
            selection_set_id=selection.id,
            user_id=users[2].id,
            revision=0,
            selected_photo_ids=[],
            updated_at=utcnow(),
        ),
        CustomerSelectionDraft(
            selection_set_id=2147483000,
            user_id=users[2].id,
            revision=1,
            selected_photo_ids=[],
            updated_at=utcnow(),
        ),
    ]:
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(state)
            db.flush()
    draft = CustomerSelectionDraft(
        selection_set_id=selection.id,
        user_id=users[2].id,
        revision=1,
        selected_photo_ids=[photo.id],
        updated_at=utcnow(),
    )
    booking = Booking(
        client_id=users[2].id, shoot_type="portrait", contact_info="123", status="pending"
    )
    db.add_all([draft, booking])
    db.flush()
    db.add(
        BookingRequestKey(
            user_id=users[2].id,
            key_hash="a" * 64,
            payload_hash="b" * 64,
            booking_id=booking.id,
            expires_at=utcnow(),
        )
    )
    db.commit()
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            BookingRequestKey(
                user_id=users[2].id,
                key_hash="a" * 64,
                payload_hash="b" * 64,
                booking_id=booking.id,
                expires_at=utcnow(),
            )
        )
        db.flush()
    db.delete(booking)
    db.commit()
    assert db.query(BookingRequestKey).count() == 0
    db.query(
        __import__("app.models.selection", fromlist=["SelectionItem"]).SelectionItem
    ).filter_by(selection_set_id=selection.id).delete()
    db.delete(selection)
    db.commit()
    assert db.query(CustomerSelectionDraft).count() == 0


@pytest.mark.parametrize("mode", ["booking", "draft", "submit", "submit_vs_draft"])
def test_real_concurrent_customer_transactions(bridge_case, mode):
    from app.core.database import SessionLocal
    from app.core.exceptions import AppException
    from app.models.booking import Booking
    from app.models.customer_bridge import BookingRequestKey, CustomerSelectionDraft
    from app.models.order import OrderTimeline
    from app.models.retouch import RetouchTask
    from app.models.selection import SelectionSubmission
    from app.models.user import User
    from app.schemas.booking import BookingCreateRequest
    from app.services.customer_workflow import change_selection, create_booking

    db, users, order, photo, extra, _, _, selection, *_ = bridge_case
    uid, oid, pid, extra_id, sid = users[2].id, order.id, photo.id, extra.id, selection.id
    if mode in ("submit", "submit_vs_draft"):
        change_selection(db, users[2], oid, 0, [pid])
    db.rollback()
    barrier = Barrier(2)

    def work(index):
        with SessionLocal() as session:
            user = session.get(User, uid)
            barrier.wait(timeout=10)
            try:
                if mode == "booking":
                    result = create_booking(
                        session,
                        user,
                        BookingCreateRequest(shoot_type="portrait", contact_info="123"),
                        "pg-concurrent-booking",
                    )
                    return 201, result.id
                submit = mode == "submit" or (mode == "submit_vs_draft" and index == 0)
                result = change_selection(
                    session,
                    user,
                    oid,
                    1 if mode in ("submit", "submit_vs_draft") else 0,
                    [pid] if submit or index == 0 else [extra_id],
                    submit=submit,
                )
                return 200, result["revision"]
            except AppException as exc:
                session.rollback()
                return exc.status_code, exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(work, [0, 1]))
    db.expire_all()
    if mode == "booking":
        assert results[0] == results[1] and results[0][0] == 201
        assert db.query(Booking).count() == db.query(BookingRequestKey).count() == 1
    elif mode == "submit":
        assert [r[0] for r in results] == [200, 200]
        assert db.query(SelectionSubmission).count() == 1
        assert db.query(OrderTimeline).filter_by(action="submit_selection").count() == 1
        assert (
            db.query(RetouchTask).filter_by(photo_id=pid).count() == 2
        )  # one fixture task + one actual side effect
    else:
        assert sorted(r[0] for r in results) == [200, 409], results
        assert db.get(CustomerSelectionDraft, sid).revision == (1 if mode == "draft" else 2)


def test_concurrent_booking_confirmation_creates_one_order(client, bridge_case):
    from app.models.booking import Booking
    from app.models.order import Order

    db, users, *_ = bridge_case
    booking = Booking(
        client_id=users[2].id, shoot_type="portrait", contact_info="123", status="pending"
    )
    db.add(booking)
    db.commit()
    bid = booking.id
    hs = [headers(users[i]) for i in [0, 1]]
    db.rollback()
    barrier = Barrier(2)

    def confirm(index):
        barrier.wait(timeout=10)
        return client.patch(
            f"/api/v1/bookings/{bid}/confirm", json={"photographer_id": 999}, headers=hs[index]
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(confirm, [0, 1]))
    assert 200 in results and sorted(results) in ([200, 403], [200, 409]), results
    assert db.query(Order).filter_by(booking_id=bid, status="CONFIRMED").count() == 1


def test_d2_upgrade_downgrade_preserves_c4(pg_database):
    from alembic import command
    from app.core.database import engine

    db, config = pg_database
    db.rollback()
    command.downgrade(config, "e6a8c0d2f434")
    tables = inspect(engine).get_table_names()
    assert "photo_metadata_overlays" in tables and "customer_selection_drafts" not in tables
    command.upgrade(config, "head")
    assert "booking_request_keys" in inspect(engine).get_table_names()
