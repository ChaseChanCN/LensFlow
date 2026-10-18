"""Real process termination on isolated SQLite; never presented as PostgreSQL proof."""

import hashlib
import multiprocessing
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError

from app.core.database import SessionLocal
from app.core.exceptions import AppException
from app.models.photo_metadata_index import PhotoMetadataIndex as Index
from app.services import metadata_index as service
from tests.postgres.pg_workers import interrupt_at, sqlite_compete


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
def test_real_sqlite_process_kill_and_restart(jpeg_case, monkeypatch, stage):
    db, users, order, photo, storage, headers = jpeg_case
    id, key = photo.id, photo.storage_key
    source = Path(storage.get_path(key))
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    business = db.execute(text("SELECT * FROM photos")).all()
    monkeypatch.setenv("STORAGE_LOCAL_PATH", str(storage.base_path))
    db.rollback()
    context = multiprocessing.get_context("spawn")
    ready = context.Event()
    worker = context.Process(target=interrupt_at, args=(stage, id, key, ready))
    worker.start()
    try:
        assert ready.wait(timeout=20), f"worker did not reach {stage}"
        worker.terminate()
        worker.join(timeout=10)
        assert worker.exitcode is not None and worker.exitcode != 0
    finally:
        if worker.is_alive():
            worker.kill()
            worker.join(timeout=5)
    db.expire_all()
    row = db.scalar(select(Index).where(Index.photo_id == id))
    if stage == "before_claim_commit":
        # SQLite SAVEPOINT may have persisted the unclaimed initial row; never its lease.
        assert row is None or (row.status == "pending" and row.lease_token is None)
    elif stage == "after_publish_commit":
        assert row.status == "indexed"
    else:
        assert row.status == "pending" and row.indexed_at is None
        row.lease_expires_at = service.utcnow() - timedelta(seconds=1)
        db.commit()  # Advance only this disposable lease, do not wait 120 seconds.
    response = service.index_photo(db, id, key)
    assert response.status == "indexed" and response.reused == (stage == "after_publish_commit")
    assert db.query(Index).count() == 1
    assert response.source_sha256 == digest == hashlib.sha256(source.read_bytes()).hexdigest()
    assert db.execute(text("SELECT * FROM photos")).all() == business


@pytest.mark.parametrize("operation,expected", [("claim", 0), ("annotation", 0), ("annotation", 1)])
def test_separate_sqlite_process_cas(jpeg_case, operation, expected):
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation

    db, users, order, photo, storage, headers = jpeg_case
    id, user_id = photo.id, users[0].id
    if expected:
        db.add(Annotation(photo_id=id, user_id=user_id, rating=1, revision=1))
        db.commit()
    db.rollback()
    context = multiprocessing.get_context("spawn")
    barrier, output = context.Barrier(2), context.Queue()
    workers = [
        context.Process(
            target=sqlite_compete, args=(operation, id, user_id, expected, rating, barrier, output)
        )
        for rating in (2, 5)
    ]
    try:
        for worker in workers:
            worker.start()
        results = [output.get(timeout=25) for _ in workers]
        for worker in workers:
            worker.join(timeout=10)
            assert worker.exitcode == 0
        assert not any("exception" in r for r in results), results
        if operation == "claim":
            assert sum(r["claimed"] for r in results) == 1
        else:
            assert sum(r["success"] for r in results) == sum(r["conflict"] for r in results) == 1
    finally:
        for worker in workers:
            if worker.is_alive():
                worker.kill()
                worker.join(timeout=5)
        output.close()


@pytest.mark.parametrize("change", ["expired", "revision", "status", "parser"])
def test_publication_requires_live_exact_claim(jpeg_case, change):
    db, users, order, photo, storage, headers = jpeg_case
    id, key = photo.id, photo.storage_key
    original = service.normalize_metadata

    def invalidate(photo_id, content):
        with SessionLocal() as other:
            row = other.scalar(select(Index).where(Index.photo_id == photo_id))
            if change == "expired":
                row.lease_expires_at = service.utcnow() - timedelta(seconds=1)
            elif change == "revision":
                row.revision += 1
            elif change == "status":
                row.status = "failed"
            else:
                row.parser_version = "newer-parser"
            other.commit()
        return original(photo_id, content)

    with patch.object(service, "normalize_metadata", side_effect=invalidate):
        response = service.index_photo(db, id, key)
    assert response.busy and not response.reused and response.status != "indexed"


@pytest.mark.parametrize(
    "sqlstate,code",
    [
        ("40P01", "INDEX_DATABASE_DEADLOCK"),
        ("40001", "INDEX_DATABASE_RETRY"),
        ("55P03", "INDEX_DATABASE_BUSY"),
        ("57014", "INDEX_DATABASE_BUSY"),
        ("08006", "INDEX_DATABASE_ERROR"),
        ("42P01", "SCHEMA_NOT_READY"),
        (None, "INDEX_DATABASE_ERROR"),
    ],
)
def test_sqlstate_classification_is_redacted(jpeg_case, sqlstate, code):
    db, *_ = jpeg_case
    original = type("DriverError", (Exception,), {"pgcode": sqlstate})("PRIVATE path token")
    with pytest.raises(AppException) as caught:
        service.database_failure(
            db, OperationalError("private query", {"secret": "PRIVATE"}, original)
        )
    assert caught.value.status_code == 503 and caught.value.code == code
    assert "PRIVATE" not in str(caught.value) and not db.in_transaction()


def test_annotation_lock_order_preserves_response_order(jpeg_case):
    from app.models.photo import Photo
    from app.schemas.photo_annotation import BatchItem
    from app.services import photo_annotation

    db, users, order, photo, storage, headers = jpeg_case
    second = Photo(
        order_id=order.id, filename="second.jpg", storage_key=photo.storage_key, size_bytes=1
    )
    db.add(second)
    db.commit()
    ids = [second.id, photo.id]
    called = []
    apply = photo_annotation.apply_item

    def observed(session, photo_id, *args):
        called.append(photo_id)
        return apply(session, photo_id, *args)

    with patch.object(photo_annotation, "apply_item", side_effect=observed):
        response = photo_annotation.write_annotations(
            db, users[0], [BatchItem(photo_id=id, expected_revision=0) for id in ids], {"rating": 4}
        )
    assert called == sorted(ids)
    assert [item.photo_id for item in response.results] == ids and response.succeeded == 2
