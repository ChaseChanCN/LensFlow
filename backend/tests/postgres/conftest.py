"""Separate process suite: deliberately exclude tests/conftest.py with --confcutdir.

Normal SQLite suite collection may discover these files; no global application
configuration is changed here and PostgreSQL tests explicitly skip without a
verified launcher capability. Never call Base.metadata.create_all/drop_all here.
"""

import importlib.util
import os
from pathlib import Path

import pytest

from scripts.postgres_sandbox import SafetyError, engine_for, identity_from_environment


def pytest_configure(config):
    config.addinivalue_line("markers", "postgres: actual isolated PostgreSQL integration")


@pytest.fixture(scope="session")
def pg_sandbox():
    capability = identity_from_environment()
    if capability is None:
        pytest.skip(
            os.environ.get(
                "LENSFLOW_PG_SKIP_REASON",
                "PostgreSQL unavailable: use scripts/test_postgres.py with explicit test config",
            )
        )
    if importlib.util.find_spec("psycopg2") is None:
        pytest.skip("PostgreSQL driver psycopg2 is unavailable")
    url, identity = capability
    verifier = engine_for(url)
    with verifier.connect() as connection:
        identity.verify(connection)
    from app.core.config import settings
    from app.core.database import engine

    if settings.db_type != "postgresql" or engine.url.database != identity.name:
        raise SafetyError("Application engine is not the launcher-owned PostgreSQL database")
    yield verifier, identity
    engine.dispose()
    verifier.dispose()


@pytest.fixture
def pg_database(pg_sandbox):
    from alembic.config import Config

    from alembic import command
    from app.core.database import SessionLocal, engine

    verifier, identity = pg_sandbox
    with verifier.connect() as connection:
        identity.verify(connection)
    engine.dispose()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    # Every destructive command is against the verified fresh run-owned database.
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    with SessionLocal() as session:
        session.execute(__import__("sqlalchemy").text("SET statement_timeout='15000ms'"))
        session.execute(__import__("sqlalchemy").text("SET lock_timeout='5000ms'"))
        session.commit()
        yield session, config
        session.rollback()
    engine.dispose()


@pytest.fixture
def pg_case(pg_database, tmp_path):
    from app.models.order import Order
    from app.models.photo import Photo
    from app.models.user import User
    from app.services.storage import LocalStorage

    db, config = pg_database
    owner = User(
        email="pg-owner@test.invalid", name="PG owner", password_hash="unused", role="photographer"
    )
    client = User(
        email="pg-client@test.invalid", name="PG client", password_hash="unused", role="client"
    )
    db.add_all([owner, client])
    db.flush()
    order = Order(
        booking_id=1, photographer_id=owner.id, client_id=client.id, status="WAITING_UPLOAD"
    )
    db.add(order)
    db.flush()
    storage = LocalStorage()
    fixture = Path(__file__).resolve().parents[1] / "fixtures/grace_hopper.jpg"
    key = storage.save("actual-photograph.jpg", fixture.read_bytes(), "image/jpeg")
    photo = Photo(
        order_id=order.id,
        filename="actual-photograph.jpg",
        storage_key=key,
        mime="image/jpeg",
        size_bytes=fixture.stat().st_size,
    )
    db.add(photo)
    db.commit()
    return db, owner, client, order, photo, config
