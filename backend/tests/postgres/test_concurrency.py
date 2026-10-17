"""Actual PostgreSQL connection/process competition; skipped if no owned server exists."""

import hashlib
import multiprocessing
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.postgres.pg_workers import compete, interrupt_at

pytestmark = pytest.mark.postgres


def processes(operation, photo_id, user_id, expected=0):
    context = multiprocessing.get_context("spawn")
    barrier, output = context.Barrier(2), context.Queue()
    workers = [
        context.Process(
            target=compete, args=(operation, photo_id, user_id, expected, rating, barrier, output)
        )
        for rating in (2, 5)
    ]
    try:
        for worker in workers:
            worker.start()
        results = [output.get(timeout=20) for _ in workers]
        for worker in workers:
            worker.join(timeout=10)
            assert worker.exitcode == 0
        assert not any("exception" in result for result in results), results
        return results
    finally:
        for worker in workers:
            if worker.is_alive():
                worker.terminate()
                worker.join(timeout=5)
        output.close()


@pytest.mark.parametrize("initial", [True, False])
def test_cross_process_annotation_cas_only_one_write_wins(pg_case, initial):
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation

    db, owner, client, order, photo, config = pg_case
    if not initial:
        db.add(Annotation(photo_id=photo.id, user_id=owner.id, rating=1, revision=1))
        db.commit()
    photo_id, user_id = photo.id, owner.id
    db.rollback()
    results = processes("annotation", photo_id, user_id, 0 if initial else 1)
    assert sum(result["success"] for result in results) == 1
    assert sum(result["conflict"] for result in results) == 1
    db.expire_all()
    row = db.query(Annotation).one()
    assert row.revision == (1 if initial else 2) and row.rating in (2, 5)


def test_cross_process_same_photo_claim_is_exclusive(pg_case):
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index

    db, owner, client, order, photo, config = pg_case
    photo_id, user_id = photo.id, owner.id
    db.rollback()
    results = processes("claim", photo_id, user_id)
    assert sum(result["claimed"] for result in results) == 1
    db.expire_all()
    row = db.query(Index).one()
    assert row.status == "pending" and row.lease_token is not None


def test_partial_annotation_conflict_and_unexpected_error_roll_back(pg_case):
    from sqlalchemy import select
    from sqlalchemy.exc import OperationalError

    from app.core.exceptions import AppException
    from app.models.photo import Photo
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
    from app.schemas.photo_annotation import BatchItem
    from app.services import photo_annotation

    db, owner, client, order, photo, config = pg_case
    second = Photo(
        order_id=order.id, filename="second.jpg", storage_key=photo.storage_key, size_bytes=1
    )
    db.add(second)
    db.add(Annotation(photo_id=photo.id, user_id=owner.id, rating=1, revision=1))
    db.commit()
    result = photo_annotation.write_annotations(
        db,
        owner,
        [
            BatchItem(photo_id=photo.id, expected_revision=0),
            BatchItem(photo_id=second.id, expected_revision=0),
        ],
        {"rating": 3},
    )
    assert result.succeeded == result.conflicted == 1
    before = [
        (r.photo_id, r.rating, r.revision)
        for r in db.scalars(select(Annotation).order_by(Annotation.photo_id))
    ]
    original = photo_annotation.apply_item
    calls = 0

    def fail_second(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OperationalError("test-only", {}, RuntimeError("injected"))
        return original(*args)

    with patch.object(photo_annotation, "apply_item", side_effect=fail_second):
        with pytest.raises(AppException) as raised:
            photo_annotation.write_annotations(
                db,
                owner,
                [
                    BatchItem(photo_id=photo.id, expected_revision=1),
                    BatchItem(photo_id=second.id, expected_revision=1),
                ],
                {"rating": 5},
            )
    assert raised.value.code == "ANNOTATION_WRITE_FAILED"
    assert [
        (r.photo_id, r.rating, r.revision)
        for r in db.scalars(
            select(Annotation)
            .execution_options(populate_existing=True)
            .order_by(Annotation.photo_id)
        )
    ] == before


@pytest.mark.parametrize(
    "stage",
    [
        "before_claim_commit",
        "after_claim_commit",
        "during_parse",
        "before_publish_commit",
        "after_publish_commit",
    ],
)
def test_real_process_termination_and_recovery(pg_case, stage):
    from sqlalchemy import select

    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.services import metadata_index
    from app.services.storage import get_storage

    db, owner, client, order, photo, config = pg_case
    photo_id, storage_key = photo.id, photo.storage_key
    source = Path(get_storage().get_path(storage_key))
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    db.rollback()
    context = multiprocessing.get_context("spawn")
    ready = context.Event()
    worker = context.Process(target=interrupt_at, args=(stage, photo_id, storage_key, ready))
    worker.start()
    try:
        assert ready.wait(timeout=20), f"worker did not reach {stage}"
        worker.terminate()  # Real OS process termination, not an exception simulation.
        worker.join(timeout=10)
        assert worker.exitcode is not None and worker.exitcode != 0
    finally:
        if worker.is_alive():
            worker.terminate()
            worker.join(timeout=5)
    db.expire_all()
    row = db.scalar(select(Index).where(Index.photo_id == photo_id))
    if stage == "before_claim_commit":
        assert row is None  # PostgreSQL rolls back the disconnected transaction.
    elif stage == "after_publish_commit":
        assert row.status == "indexed"
    else:
        assert row.status == "pending" and row.indexed_at is None
        # Advance only this disposable lease instead of making CI wait 120 seconds.
        row.lease_expires_at = metadata_index.utcnow() - timedelta(seconds=1)
        db.commit()
    recovered = metadata_index.index_photo(db, photo_id, storage_key)
    assert recovered.status == "indexed"
    assert recovered.reused == (stage == "after_publish_commit")
    assert recovered.source_sha256 == before == hashlib.sha256(source.read_bytes()).hexdigest()
    assert db.query(Index).count() == 1


def test_old_worker_cannot_publish_newer_lease(pg_case):
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.services import metadata_index

    db, owner, client, order, photo, config = pg_case
    photo_id, storage_key = photo.id, photo.storage_key
    original = metadata_index.normalize_metadata
    newer_token = None

    def reclaim(id, content):
        nonlocal newer_token
        with SessionLocal() as other:
            row = other.scalar(select(Index).where(Index.photo_id == id))
            row.lease_expires_at = metadata_index.utcnow() - timedelta(seconds=1)
            other.commit()
            newer_token, _ = metadata_index.claim(other, id)
        return original(id, content)

    with patch.object(metadata_index, "normalize_metadata", side_effect=reclaim):
        response = metadata_index.index_photo(db, photo_id, storage_key)
    assert response.status == "pending" and response.busy
    db.expire_all()
    assert db.query(Index).one().lease_token == newer_token
