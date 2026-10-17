from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from app.core.exceptions import AppException

from app.models.photo import Photo
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.schemas.metadata_index import IndexBatchRequest
from app.services import metadata_index as service


@pytest.mark.parametrize("stage", ["new_flush", "claim_commit", "publish_execute", "publish_commit"])
def test_database_busy_rolls_back_without_publishing_success(jpeg_case, monkeypatch, stage):
    db, users, order, photo, storage, headers = jpeg_case
    photo_id, key = photo.id, photo.storage_key
    failure = OperationalError("test-only locked transaction", {}, Exception("locked"))
    with monkeypatch.context() as faults:
        def fail(*args, **kwargs):
            raise failure

        if stage.startswith("publish"):
            # Commit the lease, then inject a fault only when the result is published.
            claim = service.claim

            def claimed(session, id):
                value = claim(session, id)
                faults.setattr(session, "execute" if stage.endswith("execute") else "commit", fail)
                return value

            faults.setattr(service, "claim", claimed)
        else:
            faults.setattr(db, "flush" if stage == "new_flush" else "commit", fail)
        with pytest.raises(AppException) as caught:
            service.index_photo(db, photo_id, key)
    assert caught.value.code == "INDEX_DATABASE_BUSY" and caught.value.status_code == 503
    assert db.is_active and not db.in_transaction()
    row = db.scalar(select(Index).where(Index.photo_id == photo_id))
    assert row is None or row.status == "pending"
    if row is not None:
        # Publication failure leaves a committed lease, recovered by the existing expiry policy.
        row.lease_expires_at = service.utcnow()
        db.commit()
    assert service.index_photo(db, photo_id, key).status == "indexed"


def test_parser_upgrade_changes_counts_generation(jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    service.index_photo(db, photo.id, photo.storage_key)
    before = service.index_counts(db, order.id)
    monkeypatch.setattr(service, "PARSER_VERSION", "c1-v1.next-index")
    after = service.index_counts(db, order.id)
    assert after.generation != before.generation
    assert before.indexed == 1 and after.pending == 1 and after.indexed == 0


def test_batch_skips_photo_deleted_after_selection(jpeg_case, monkeypatch):
    db, users, order, photo, storage, headers = jpeg_case
    order_id, user_id = order.id, users[0].id
    original = service.index_photo

    def deleted(session, photo_id, key):
        session.execute(delete(Photo).where(Photo.id == photo_id))
        session.commit()
        return original(session, photo_id, key)

    monkeypatch.setattr(service, "index_photo", deleted)
    batch = service.index_batch(db, order_id, user_id, IndexBatchRequest(limit=1))
    assert batch.results == [] and batch.next_cursor is None and batch.counts.total == 0


def test_busy_processor_is_explicit_pending_and_can_resume(client, jpeg_case):
    *_, photo, storage, headers = jpeg_case
    from app.services.photo_metadata import metadata_slot

    with metadata_slot(), metadata_slot():
        r = client.post(f"/api/v1/photos/{photo.id}/metadata-index", json={}, headers=headers)
    assert (
        r.status_code == 200
        and r.json()["status"] == "pending"
        and r.json()["error_code"] == "METADATA_BUSY"
    )
    assert (
        client.post(f"/api/v1/photos/{photo.id}/metadata-index", json={}, headers=headers).json()[
            "status"
        ]
        == "indexed"
    )


def test_batch_time_budget_and_failed_retry(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    for i in range(4):
        db.add(
            Photo(
                order_id=order.id, filename=f"{i}.jpg", storage_key=photo.storage_key, size_bytes=1
            )
        )
    db.commit()
    with patch.object(service.time, "monotonic", side_effect=[0, 2]):
        result = service.index_batch(db, order.id, users[0].id, IndexBatchRequest(limit=5))
    assert len(result.results) == 1 and result.next_cursor
    row = db.scalar(select(Index))
    row.status = "failed"
    row.error_code = "STORAGE_UNAVAILABLE"
    db.commit()
    response = client.post(
        f"/api/v1/orders/{order.id}/metadata-index",
        headers=headers,
        json={"mode": "retry", "limit": 5},
    )
    assert response.status_code == 200 and response.json()["counts"]["indexed"] == 5


@pytest.mark.parametrize(
    "sort", ["id_asc", "id_desc", "created_asc", "created_desc", "rating_asc", "rating_desc"]
)
def test_metadata_all_sort_keysets_with_ties(client, jpeg_case, sort):
    db, users, order, photo, storage, headers = jpeg_case
    ids = [photo.id]
    for i in range(10):
        item = Photo(order_id=order.id, filename=str(i), storage_key="never-read", size_bytes=1)
        db.add(item)
        db.flush()
        ids.append(item.id)
    for id in ids:
        db.add(
            Index(
                photo_id=id,
                source_sha256="a" * 64,
                parser_version=service.PARSER_VERSION,
                status="indexed",
                indexed_at=service.utcnow(),
                camera_model="70d",
                iso=100,
            )
        )
    db.commit()
    cursor = None
    actual = []
    while True:
        r = client.get(
            f"/api/v1/orders/{order.id}/photos/catalog",
            headers=headers,
            params={
                "camera_model": "70d",
                "sort": sort,
                "limit": 3,
                **({"cursor": cursor} if cursor else {}),
            },
        )
        assert r.status_code == 200
        result = r.json()
        actual.extend(x["id"] for x in result["items"])
        cursor = result["next_cursor"]
        if not cursor:
            break
    assert actual == sorted(ids, reverse=sort.endswith("desc"))


def test_facets_and_year_group_are_bounded(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    for i in range(205):
        item = Photo(order_id=order.id, filename=str(i), storage_key="never-read", size_bytes=1)
        db.add(item)
        db.flush()
        db.add(
            Index(
                photo_id=item.id,
                source_sha256="a" * 64,
                parser_version=service.PARSER_VERSION,
                status="indexed",
                indexed_at=service.utcnow(),
                camera_model=f"camera-{i:03}",
                capture_date=date(1800 + i, 1, 1),
            )
        )
    db.commit()
    facets = client.get(f"/api/v1/orders/{order.id}/photos/metadata-facets", headers=headers).json()
    timeline = client.get(f"/api/v1/orders/{order.id}/photos/timeline", headers=headers).json()
    assert len(facets["camera_model"]) == 50 and facets["truncated"]
    assert len(timeline["buckets"]) == 200 and timeline["truncated"] and timeline["matched"] == 205
