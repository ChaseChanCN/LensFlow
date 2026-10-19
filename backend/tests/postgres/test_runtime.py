"""Bounded real lock/pool failures, lease boundaries and readiness on owned PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.postgres


def test_application_timestamps_are_utc_on_non_utc_server(pg_case):
    from datetime import datetime, timezone

    from sqlalchemy import text

    from app.schemas.photo_annotation import BatchItem
    from app.services.photo_annotation import write_annotations

    db, owner, client, order, photo, config = pg_case
    assert db.scalar(text("SHOW TimeZone")) == "UTC"
    now = datetime.now(timezone.utc)
    assert abs((photo.created_at.replace(tzinfo=timezone.utc) - now).total_seconds()) < 10
    result = write_annotations(
        db, owner, [BatchItem(photo_id=photo.id, expected_revision=0)], {"rating": 4}
    )
    timestamp = result.results[0].annotation.updated_at
    assert timestamp is not None
    assert abs((timestamp - datetime.now(timezone.utc)).total_seconds()) < 5


def test_pool_saturation_pre_ping_and_recovery(pg_sandbox):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import TimeoutError

    from app.core.database import engine

    pool = create_engine(
        engine.url,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.2,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 2},
    )
    try:
        with pool.connect() as held:
            assert held.scalar(text("SELECT 1")) == 1
            with pytest.raises(TimeoutError):
                pool.connect()
            held.invalidate()
        with pool.connect() as fresh:
            assert fresh.scalar(text("SELECT 1")) == 1
            backend_pid = fresh.scalar(text("SELECT pg_backend_pid()"))
        # Kill only the exact backend opened above, in this run-owned DB.
        verifier, identity = pg_sandbox
        with verifier.connect() as connection:
            identity.verify(connection)
            assert connection.scalar(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE pid=:pid AND datid=:oid"
                ),
                {"pid": backend_pid, "oid": identity.oid},
            )
        with pool.connect() as recovered:
            assert recovered.scalar(text("SELECT pg_backend_pid()")) != backend_pid
            assert recovered.scalar(text("SELECT 1")) == 1
        assert pool.pool.checkedout() == 0
    finally:
        pool.dispose()


def test_real_statement_and_row_lock_timeouts_are_sanitized(pg_case, record_property):
    import time

    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    from app.core.database import SessionLocal, engine
    from app.core.exceptions import AppException
    from app.services.metadata_index import database_failure

    db, owner, client, order, photo, config = pg_case
    photo_id = photo.id
    db.rollback()
    with SessionLocal() as timed:
        timed.execute(text("SET LOCAL statement_timeout='100ms'"))
        started = time.perf_counter()
        with pytest.raises(DBAPIError) as raised:
            timed.execute(text("SELECT pg_sleep(0.5)"))
        assert raised.value.orig.pgcode == "57014"
        record_property("statement_timeout_ms", round((time.perf_counter() - started) * 1000, 3))
        record_property("statement_sqlstate", raised.value.orig.pgcode)
        with pytest.raises(AppException) as mapped:
            database_failure(timed, raised.value)
        assert mapped.value.status_code == 503 and mapped.value.code == "INDEX_DATABASE_BUSY"
        assert timed.scalar(text("SELECT 1")) == 1
    with engine.connect() as holder:
        transaction = holder.begin()
        holder.execute(text("SELECT id FROM photos WHERE id=:id FOR UPDATE"), {"id": photo_id})
        try:
            with SessionLocal() as competing:
                competing.execute(text("SET LOCAL lock_timeout='100ms'"))
                started = time.perf_counter()
                with pytest.raises(DBAPIError) as locked:
                    competing.execute(
                        text("UPDATE photos SET width=width WHERE id=:id"), {"id": photo_id}
                    )
                assert locked.value.orig.pgcode == "55P03"
                record_property(
                    "row_lock_wait_ms", round((time.perf_counter() - started) * 1000, 3)
                )
                record_property("lock_sqlstate", locked.value.orig.pgcode)
                with pytest.raises(AppException) as mapped:
                    database_failure(competing, locked.value)
                assert mapped.value.code == "INDEX_DATABASE_BUSY"
                assert competing.scalar(text("SELECT 1")) == 1
        finally:
            transaction.rollback()


@pytest.mark.parametrize(
    "isolation,expected", [("READ COMMITTED", "40P01"), ("SERIALIZABLE", "40001")]
)
def test_actual_deadlock_and_serialization_sqlstates(pg_case, isolation, expected):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    from app.core.database import engine
    from app.models.photo import Photo

    db, owner, client, order, photo, config = pg_case
    second = Photo(order_id=order.id, filename="second.jpg", storage_key="not-read", size_bytes=1)
    db.add(second)
    db.commit()
    ids = [photo.id, second.id]
    db.rollback()
    barrier = Barrier(2)

    def compete(index):
        with engine.connect().execution_options(isolation_level=isolation) as connection:
            tx = connection.begin()
            try:
                connection.execute(text("SET LOCAL statement_timeout='8000ms'"))
                connection.execute(text("SET LOCAL lock_timeout='5000ms'"))
                if isolation == "SERIALIZABLE":
                    connection.execute(
                        text("SELECT width FROM photos WHERE id=:id"), {"id": ids[0]}
                    ).all()
                    barrier.wait(timeout=10)
                    connection.execute(
                        text("UPDATE photos SET width=:value WHERE id=:id"),
                        {"id": ids[0], "value": index + 1},
                    )
                else:
                    connection.execute(
                        text("UPDATE photos SET width=:value WHERE id=:id"),
                        {"id": ids[index], "value": index + 1},
                    )
                    barrier.wait(timeout=10)
                    connection.execute(
                        text("UPDATE photos SET width=:value WHERE id=:id"),
                        {"id": ids[1 - index], "value": index + 1},
                    )
                tx.commit()
                return "committed"
            except DBAPIError as exc:
                tx.rollback()
                assert connection.scalar(text("SELECT 1")) == 1
                return exc.orig.pgcode

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(compete, (0, 1)))
    assert sorted(results) == sorted(["committed", expected])


def test_opposite_order_annotation_batches_and_lost_response(pg_case):
    from app.core.database import SessionLocal
    from app.models.photo import Photo
    from app.models.user import User
    from app.schemas.photo_annotation import BatchItem
    from app.services.photo_annotation import load_annotation, write_annotations

    db, owner, client, order, photo, config = pg_case
    second = Photo(order_id=order.id, filename="second.jpg", storage_key="not-read", size_bytes=1)
    db.add(second)
    db.commit()
    ids, uid = [photo.id, second.id], owner.id
    db.rollback()
    barrier = Barrier(2)

    def write(index):
        with SessionLocal() as session:
            user = session.get(User, uid)
            barrier.wait(timeout=10)
            sequence = ids if index == 0 else list(reversed(ids))
            result = write_annotations(
                session,
                user,
                [BatchItem(photo_id=id, expected_revision=0) for id in sequence],
                {"rating": index + 3},
            )
            assert [item.photo_id for item in result.results] == sequence
            return result.succeeded, result.conflicted

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, (0, 1)))
    assert sorted(results) == [(0, 2), (2, 0)]
    # Discard the committed response; replay of an old revision must conflict.
    write_annotations(db, owner, [BatchItem(photo_id=ids[0], expected_revision=1)], {"rating": 5})
    retry = write_annotations(
        db, owner, [BatchItem(photo_id=ids[0], expected_revision=1)], {"rating": 2}
    )
    assert retry.conflicted == 1
    assert load_annotation(db, ids[0], uid).rating == 5
    assert load_annotation(db, ids[0], uid).revision == 2


@pytest.mark.parametrize("change", ["expire", "delete", "parser"])
def test_parse_has_no_transaction_and_late_publish_cannot_win(pg_case, change):
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.core.exceptions import NotFoundException
    from app.models.photo import Photo
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.services import metadata_index as service

    db, owner, client, order, photo, config = pg_case
    pid, key = photo.id, photo.storage_key
    db.rollback()
    original = service.normalize_metadata

    def boundary(*args):
        assert not db.in_transaction(), "JPEG parsing must not retain a database transaction"
        with SessionLocal() as other:
            row = other.scalar(select(Index).where(Index.photo_id == pid))
            if change == "expire":
                row.lease_expires_at = service.utcnow() - timedelta(seconds=1)
            elif change == "parser":
                row.parser_version = "changed-parser"
            else:
                other.delete(other.get(Photo, pid))
            other.commit()
        return original(*args)

    with patch.object(service, "normalize_metadata", side_effect=boundary):
        if change == "delete":
            with pytest.raises(NotFoundException):
                service.index_photo(db, pid, key)
        else:
            result = service.index_photo(db, pid, key)
            assert result.status == "pending" and result.busy and not result.reused
    assert db.query(Index).count() == (0 if change == "delete" else 1)


def test_readiness_on_empty_historical_and_head_is_readonly(pg_database, pg_sandbox):
    from alembic.script import ScriptDirectory
    from fastapi.testclient import TestClient
    from sqlalchemy import inspect, text

    from alembic import command
    from app.core.database import engine
    from app.main import app

    db, config = pg_database
    db.close()
    engine.dispose()
    command.downgrade(config, "base")
    for revision, expected in [(None, 503), ("5e0b2fd720d3", 503), ("head", 200)]:
        if revision:
            command.upgrade(config, revision)
        before = inspect(engine).get_table_names()
        with TestClient(app) as client:
            assert client.get("/health").status_code == 200
            response = client.get("/ready")
            assert response.status_code == expected
        assert inspect(engine).get_table_names() == before
        if revision:
            with engine.connect() as connection:
                assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
                    ScriptDirectory.from_config(config).get_current_head()
                    if revision == "head"
                    else revision
                )
        engine.dispose()
