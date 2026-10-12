"""Database engine and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.sync_database_url,
    echo=settings.app_debug,
    connect_args={"check_same_thread": False} if settings.db_type == "sqlite" else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
