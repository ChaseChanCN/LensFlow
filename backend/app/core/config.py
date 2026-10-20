"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


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
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_pool_timeout_seconds: int = Field(default=10, ge=1, le=120)
    db_connect_timeout_seconds: int = Field(default=5, ge=1, le=60)

    # Security
    jwt_secret_key: str = "change-this-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    # Public authentication: SMS only by default. Never put these secrets in VITE_*.
    auth_legacy_password_enabled: bool = False
    sms_enabled: bool = False
    sms_access_key_id: str = Field(default="", repr=False)
    sms_access_key_secret: str = Field(default="", repr=False)
    sms_security_token: str = Field(default="", repr=False)
    sms_code_pepper: str = Field(default="", repr=False)
    sms_sign_name: str = "时隙摄影工作室"
    sms_register_template_code: str = "SMS_512571445"
    sms_login_template_code: str = "SMS_512641429"
    sms_phone_hour_limit: int = Field(default=5, ge=1, le=20)
    sms_phone_day_limit: int = Field(default=10, ge=1, le=50)
    sms_ip_hour_limit: int = Field(default=20, ge=1, le=200)
    sms_global_day_limit: int = Field(default=200, ge=1, le=10000)

    # Storage
    storage_type: Literal["local", "obs"] = "local"
    storage_local_path: str = "storage_local/uploads"
    image_max_bytes: int = Field(default=20 * 1024 * 1024, gt=0)
    image_max_pixels: int = Field(default=24_000_000, gt=0)
    image_max_dimension: int = Field(default=12_000, gt=0)
    obs_bucket: str = ""
    obs_endpoint: str = ""
    obs_ak: str = ""
    obs_sk: str = ""

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
        return self._pg_url(self.db_pg_driver)

    @property
    def sync_database_url(self) -> str:
        """Synchronous DB URL for Alembic migrations."""
        if self.db_type == "sqlite":
            return f"sqlite:///{self.db_sqlite_path}"
        return self._pg_url("psycopg2")

    def _pg_url(self, driver: str) -> str:
        return URL.create(
            f"postgresql+{driver}",
            username=self.db_pg_user,
            password=self.db_pg_password,
            host=self.db_pg_host,
            port=self.db_pg_port,
            database=self.db_pg_name,
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
