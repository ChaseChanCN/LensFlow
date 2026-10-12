"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_name: str = "LensFlow"
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Database
    db_type: Literal["sqlite", "postgresql"] = "sqlite"
    db_sqlite_path: str = "storage_local/lensflow.db"
    db_pg_host: str = "localhost"
    db_pg_port: int = 5432
    db_pg_user: str = "lensflow"
    db_pg_password: str = "changeme"
    db_pg_name: str = "lensflow"
    db_pg_driver: str = "asyncpg"

    # Security
    jwt_secret_key: str = "change-this-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    # Storage
    storage_type: Literal["local", "obs"] = "local"
    storage_local_path: str = "storage_local/uploads"

    # Notification
    notifier_channel: Literal["bark", "wechat_work"] = "bark"
    bark_server_url: str = "https://api.day.app"
    bark_device_key: str = ""
    wechat_work_webhook_url: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        if self.db_type == "sqlite":
            return f"sqlite:///{self.db_sqlite_path}"
        return (
            f"postgresql+{self.db_pg_driver}://{self.db_pg_user}:{self.db_pg_password}"
            f"@{self.db_pg_host}:{self.db_pg_port}/{self.db_pg_name}"
        )

    @property
    def sync_database_url(self) -> str:
        """Synchronous DB URL for Alembic migrations."""
        if self.db_type == "sqlite":
            return f"sqlite:///{self.db_sqlite_path}"
        return (
            f"postgresql+psycopg2://{self.db_pg_user}:{self.db_pg_password}"
            f"@{self.db_pg_host}:{self.db_pg_port}/{self.db_pg_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
