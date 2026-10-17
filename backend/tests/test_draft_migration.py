import sqlite3
from contextlib import closing
from io import StringIO

from alembic.config import Config
from sqlalchemy import inspect

from alembic import command
from app.core.config import settings
from app.core.database import engine


def test_sqlite_upgrade_downgrade_preserves_business_data(tmp_path, monkeypatch):
    target = tmp_path / "migration.sqlite"
    monkeypatch.setattr(settings, "db_sqlite_path", target.as_posix())
    config = Config("alembic.ini")
    command.upgrade(config, "f3a1c2d4e5b6")
    with closing(sqlite3.connect(target)) as db, db:
        db.execute(
            "INSERT INTO users(id,email,password_hash,name,role,is_active) "
            "VALUES(1,'safe@test.com','x','Safe','photographer',1)"
        )
        before = db.execute("SELECT * FROM users").fetchall()
        tables = set(
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        )
    command.upgrade(config, "b2d4a6c8e010")
    with closing(sqlite3.connect(target)) as db, db:
        assert db.execute("SELECT * FROM users").fetchall() == before
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "b2d4a6c8e010"
        assert len(db.execute("PRAGMA foreign_key_list(photo_edit_drafts)").fetchall()) == 2
    command.downgrade(config, "f3a1c2d4e5b6")
    with closing(sqlite3.connect(target)) as db, db:
        assert db.execute("SELECT * FROM users").fetchall() == before
        assert (
            set(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
            == tables
        )
    assert target.resolve() != __import__("pathlib").Path(engine.url.database).resolve()


def test_new_model_constraints_and_sqlite_enforcement():
    engine.dispose()  # Discard pooled SQLite schema caches after create/drop cycles.
    schema = inspect(engine)
    assert len(schema.get_foreign_keys("photo_edit_drafts")) == 2
    with engine.connect() as connection:
        ddl = connection.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE name='photo_edit_drafts'"
        ).scalar_one()
    assert any(
        constraint["column_names"] == ["photo_id", "user_id"]
        for constraint in schema.get_unique_constraints("photo_edit_drafts")
    ), ddl
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1


def test_postgresql_offline_ddl_only(monkeypatch):
    # SQL generation is NOT a live PostgreSQL upgrade/downgrade test.
    monkeypatch.setattr(settings, "db_type", "postgresql")
    output = StringIO()
    config = Config("alembic.ini", output_buffer=output)
    command.upgrade(config, "f3a1c2d4e5b6:b2d4a6c8e010", sql=True)
    sql = output.getvalue()
    assert "CREATE TABLE photo_edit_drafts" in sql
    assert "JSON" in sql and "REFERENCES photos" in sql
    assert "DROP TABLE" not in sql and "ALTER TABLE photos" not in sql
