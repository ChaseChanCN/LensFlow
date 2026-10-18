import multiprocessing

import pytest
from sqlalchemy import inspect, select, text

from app.models.photo import Photo
from app.models.photo_metadata_overlay import PhotoEffectiveKeyword as Keyword
from app.models.photo_metadata_overlay import PhotoKeywordState as State
from app.models.photo_metadata_overlay import PhotoMetadataOverlay as Overlay
from tests.media_fixtures import access_case, jpeg_case  # noqa: F401
from tests.postgres.c4_workers import compete
from tests.test_metadata_overlay import (  # noqa: F401
    test_batch_effective_keywords_conflicts_authorization_and_rollback,
    test_contract_privacy_bounds,
    test_database_constraints_and_delete_cascade,
    test_invalid_fields,
    test_invalid_keywords,
    test_keyword_combined_sql_filters_and_timeline,
    test_keyword_search_source_parser_and_cursor,
    test_modes_cas_reset_immutability,
    test_rebuild_skips_invalid_sources_and_removes_stale_projection,
    test_source_change_preserves_overlay_and_rebuild_uses_current_revision,
    test_xmp_roundtrip_whitelist_headers_and_bytes,
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


@pytest.mark.parametrize(
    "existing,reversed_ids,rebuild_only",
    [(False, False, False), (True, False, False), (True, True, False), (True, True, True)],
)
def test_process_cas_and_rebuild_races(pg_case, existing, reversed_ids, rebuild_only):
    from app.schemas.metadata_overlay import BatchItem, Operation
    from app.services.metadata_overlay import mutate

    db, owner, customer, order, photo, config = pg_case
    photos = [photo]
    if reversed_ids:
        second = Photo(
            order_id=order.id,
            filename="second.jpg",
            storage_key=photo.storage_key,
            mime="image/jpeg",
            size_bytes=1,
        )
        db.add(second)
        db.commit()
        photos.append(second)
    ids = [p.id for p in photos]
    if existing:
        assert mutate(
            db,
            owner,
            [BatchItem(photo_id=i, expected_revision=0) for i in ids],
            operation=Operation(type="keywords_add", keywords=["初始"]),
        )["succeeded"] == len(ids)
    owner_id = owner.id
    db.rollback()
    context = multiprocessing.get_context("spawn")
    barrier = context.Barrier(2)
    output = context.Queue()
    jobs = [
        context.Process(
            target=compete, args=(ids, owner_id, [int(existing)] * len(ids), "甲", barrier, output)
        ),
        context.Process(
            target=compete,
            args=(
                list(reversed(ids)) if reversed_ids else ids,
                owner_id,
                [int(existing)] * len(ids),
                "乙",
                barrier,
                output,
                rebuild_only,
            ),
        ),
    ]
    try:
        for job in jobs:
            job.start()
        values = [output.get(timeout=35) for _ in jobs]
        for job in jobs:
            job.join(timeout=10)
        assert all(job.exitcode == 0 for job in jobs), values
        assert not any("exception" in v for v in values), values
        if not rebuild_only:
            assert sorted(v["success"] for v in values) == [0, len(ids)], values
            assert sorted(v["conflict"] for v in values) == [0, len(ids)], values
        db.expire_all()
        rows = db.scalars(select(Overlay).where(Overlay.photo_id.in_(ids))).all()
        assert len(rows) == len(ids)
        for row in rows:
            assert row.revision == int(existing) + 1
            state = db.scalar(select(State).where(State.photo_id == row.photo_id))
            assert state.overlay_revision == row.revision
            assert set(
                db.scalars(select(Keyword.display).where(Keyword.state_id == state.id))
            ) == set(row.keywords_value)
    finally:
        for job in jobs:
            if job.is_alive():
                job.terminate()
                job.join(timeout=5)
        output.close()


def test_migration_roundtrip_and_utc(pg_database):
    from alembic import command
    from app.core.database import engine

    db, config = pg_database
    assert db.scalar(text("SHOW TimeZone")) == "UTC"
    assert set(
        ["photo_metadata_overlays", "photo_keyword_states", "photo_effective_keywords"]
    ) <= set(inspect(engine).get_table_names())
    db.rollback()
    command.downgrade(config, "d5f7a9c1e323")
    assert "photo_metadata_overlays" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    assert set(
        ["photo_metadata_overlays", "photo_keyword_states", "photo_effective_keywords"]
    ) <= set(inspect(engine).get_table_names())
