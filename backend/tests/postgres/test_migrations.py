"""Real PostgreSQL migration execution only; no SQLite fallbacks or metadata.create_all."""

import pytest

pytestmark = pytest.mark.postgres


def test_full_chain_tables_constraints_and_crud(pg_case):
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect, text
    from sqlalchemy.exc import IntegrityError

    from app.core.database import SessionLocal
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.services.metadata_index import PARSER_VERSION, utcnow

    db, owner, client, order, photo, config = pg_case
    inspector = inspect(db.get_bind())
    assert {
        "users",
        "orders",
        "photos",
        "deliveries",
        "selection_sets",
        "retouch_versions",
        "photo_edit_drafts",
        "photo_asset_annotations",
        "photo_metadata_indexes",
    } <= set(inspector.get_table_names())
    assert (
        db.scalar(text("SELECT version_num FROM alembic_version"))
        == ScriptDirectory.from_config(config).get_current_head()
    )
    uniques = inspector.get_unique_constraints("photo_metadata_indexes")
    assert any(item["column_names"] == ["photo_id"] for item in uniques)
    assert any(
        item["referred_table"] == "photos" and item["options"].get("ondelete") == "CASCADE"
        for item in inspector.get_foreign_keys("photo_metadata_indexes")
    )
    checks = {item["name"] for item in inspector.get_check_constraints("photo_metadata_indexes")}
    assert {
        "ck_metadata_status",
        "ck_metadata_sha",
        "ck_metadata_iso",
        "ck_metadata_timezone",
    } <= checks
    db.add(Annotation(photo_id=photo.id, user_id=owner.id, rating=3, revision=1))
    db.add(
        Index(
            photo_id=photo.id,
            status="indexed",
            parser_version=PARSER_VERSION,
            source_sha256="a" * 64,
            indexed_at=utcnow(),
        )
    )
    db.commit()
    for changes in ({"iso": 0}, {"source_sha256": "Z" * 64}, {"f_number": -1}):
        with SessionLocal() as separate:
            row = separate.query(Index).filter_by(photo_id=photo.id).one()
            for name, value in changes.items():
                setattr(row, name, value)
            with pytest.raises(IntegrityError):
                separate.commit()
            separate.rollback()
    with SessionLocal() as separate:
        separate.add(Index(photo_id=photo.id, status="pending", parser_version=PARSER_VERSION))
        with pytest.raises(IntegrityError):
            separate.commit()
        separate.rollback()
    db.delete(photo)
    db.commit()
    assert db.query(Index).count() == db.query(Annotation).count() == 0


def test_historical_upgrade_preserves_existing_photo_rows(pg_database, pg_sandbox):
    from sqlalchemy import text

    from alembic import command
    from app.core.database import engine

    db, config = pg_database
    db.close()
    engine.dispose()
    verifier, identity = pg_sandbox
    with verifier.connect() as connection:
        identity.verify(connection)
    command.downgrade(config, "base")
    command.upgrade(config, "5e0b2fd720d3")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO photos(order_id,filename,storage_key,mime,size_bytes) VALUES(1,'historical.jpg','read-only','image/jpeg',123)"
            )
        )
        before = connection.execute(text("SELECT * FROM photos ORDER BY id")).all()
    engine.dispose()
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT * FROM photos ORDER BY id")).all() == before
        assert connection.scalar(text("SELECT count(*) FROM photo_metadata_indexes")) == 0


def test_metadata_downgrade_and_reupgrade_preserve_business_and_annotations(pg_case, pg_sandbox):
    from sqlalchemy import inspect, text

    from alembic import command
    from app.core.database import engine
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
    from app.services.metadata_index import index_photo

    db, owner, client, order, photo, config = pg_case
    assert index_photo(db, photo.id, photo.storage_key).status == "indexed"
    db.add(Annotation(photo_id=photo.id, user_id=owner.id, rating=4, revision=1))
    db.commit()
    before = db.execute(text("SELECT * FROM photos ORDER BY id")).all()
    annotations = db.execute(text("SELECT * FROM photo_asset_annotations ORDER BY id")).all()
    db.close()
    engine.dispose()
    verifier, identity = pg_sandbox
    with verifier.connect() as connection:
        identity.verify(connection)
    command.downgrade(config, "c4e6a8b0d212")
    assert "photo_metadata_indexes" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT * FROM photos ORDER BY id")).all() == before
        assert (
            connection.execute(text("SELECT * FROM photo_asset_annotations ORDER BY id")).all()
            == annotations
        )
    engine.dispose()
    command.upgrade(config, "head")
    assert "photo_metadata_indexes" in inspect(engine).get_table_names()
