"""Database engine and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.sync_database_url,
    echo=settings.app_debug,
    connect_args={"check_same_thread": False}
    if settings.db_type == "sqlite"
    else {"connect_timeout": settings.db_connect_timeout_seconds},
    **({} if settings.db_type == "sqlite" else {
        "pool_pre_ping": True, "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout_seconds,
    }),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

if settings.db_type == "sqlite":

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
