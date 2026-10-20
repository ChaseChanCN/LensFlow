"""Explicitly owned disposable PostgreSQL databases; never use application DB defaults.

Only the launcher creates databases. A name is not proof of ownership: every schema
mutation and cleanup also verifies the OID, owner and random database comment.
"""

import os
import re
import secrets
from dataclasses import dataclass
from urllib.parse import quote

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

ACK = "CREATE_NEW_DISPOSABLE_DATABASES_ONLY"
PREFIX = "lensflow_test_"


class SafetyError(RuntimeError):
    """Fail closed before any DDL against an unverified database."""


def admin_configuration(environ=None):
    environ = os.environ if environ is None else environ
    value = environ.get("LENSFLOW_PG_TEST_ADMIN_DSN")
    if not value:
        return None
    if environ.get("LENSFLOW_PG_TEST_ALLOW_CREATE") != ACK:
        raise SafetyError("Explicit disposable-database creation acknowledgement is required")
    try:
        url = make_url(value)
    except Exception:
        raise SafetyError("Invalid dedicated PostgreSQL test DSN") from None
    if (
        url.drivername != "postgresql+psycopg2"
        or url.host not in ("127.0.0.1", "localhost", "::1")
        or url.database not in ("postgres", "template1")
        or not url.username
        or url.query
    ):
        raise SafetyError(
            "Use an explicit loopback postgresql+psycopg2 admin DSN for postgres/template1"
        )
    return url


def engine_for(url):
    return create_engine(
        url,
        poolclass=NullPool,
        connect_args={
            "connect_timeout": 5,
            "options": "-c statement_timeout=15000 -c lock_timeout=5000 "
            "-c idle_in_transaction_session_timeout=15000",
        },
    )


IDENTITY_SQL = text(
    "SELECT d.oid, d.datname, pg_get_userbyid(d.datdba) AS owner, "
    "shobj_description(d.oid, 'pg_database') AS marker, current_user AS actor "
    "FROM pg_database d WHERE d.datname=:name"
)


@dataclass(frozen=True)
class Identity:
    name: str
    oid: int
    owner: str
    marker: str

    def verify(self, connection):
        row = connection.execute(IDENTITY_SQL, {"name": self.name}).mappings().one_or_none()
        if (
            row is None
            or row["oid"] != self.oid
            or row["owner"] != self.owner
            or row["actor"] != self.owner
            or row["marker"] != self.marker
            or not re.fullmatch(r"lensflow_test_[0-9a-f]{32}", self.name)
        ):
            raise SafetyError("PostgreSQL test ownership identity does not match; refusing DDL")

    def environment(self, url):
        return {
            "LENSFLOW_PG_TEST_DSN": url.render_as_string(hide_password=False),
            "LENSFLOW_PG_TEST_NAME": self.name,
            "LENSFLOW_PG_TEST_OID": str(self.oid),
            "LENSFLOW_PG_TEST_OWNER": self.owner,
            "LENSFLOW_PG_TEST_MARKER": self.marker,
            "DB_TYPE": "postgresql",
            "DB_PG_HOST": url.host,
            "DB_PG_PORT": str(url.port or 5432),
            "DB_PG_USER": url.username,
            "DB_PG_PASSWORD": url.password or "",
            "DB_PG_NAME": self.name,
            "APP_DEBUG": "false",
            "AUTH_LEGACY_PASSWORD_ENABLED": "true",
            "SMS_ENABLED": "false",
            "PGOPTIONS": "-c statement_timeout=15000 -c lock_timeout=5000 "
            "-c idle_in_transaction_session_timeout=15000",
            "BARK_DEVICE_KEY": "",
            "WECHAT_WORK_WEBHOOK_URL": "",
        }


def identity_from_environment(environ=None):
    environ = os.environ if environ is None else environ
    value = environ.get("LENSFLOW_PG_TEST_DSN")
    if not value:
        return None
    try:
        identity = Identity(
            environ["LENSFLOW_PG_TEST_NAME"],
            int(environ["LENSFLOW_PG_TEST_OID"]),
            environ["LENSFLOW_PG_TEST_OWNER"],
            environ["LENSFLOW_PG_TEST_MARKER"],
        )
        url = make_url(value)
        valid = (
            url.drivername == "postgresql+psycopg2"
            and url.database == identity.name
            and url.username == identity.owner
            and url.host in ("127.0.0.1", "localhost", "::1")
            and not url.query
            and re.fullmatch(r"lensflow_test_[0-9a-f]{32}", identity.name)
            and re.fullmatch(r"lensflow-pg-owned:[0-9a-f]{64}", identity.marker)
            and identity.oid > 0
        )
        if not valid:
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise SafetyError("Missing or invalid launcher ownership capability") from None
    return url, identity


class OwnedPostgres:
    def __init__(self, admin_url):
        self.admin = engine_for(admin_url)
        self.url = admin_url.set(database=PREFIX + secrets.token_hex(16))
        self.identity = None
        self.engine = None

    def __enter__(self):
        try:
            return self._create()
        except BaseException:
            # __exit__ is not invoked when __enter__ fails. Only a fully recorded
            # ownership capability permits cleanup; uncertainty must fail closed.
            self.__exit__(*__import__("sys").exc_info())
            raise

    def _create(self):
        marker = "lensflow-pg-owned:" + secrets.token_hex(32)
        quoted_name = self.admin.dialect.identifier_preparer.quote(self.url.database)
        with self.admin.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            # CREATE without IF NOT EXISTS guarantees this invocation created the resource.
            conn.exec_driver_sql(f"CREATE DATABASE {quoted_name} TEMPLATE template0")
            conn.exec_driver_sql(f"COMMENT ON DATABASE {quoted_name} IS %s", (marker,))
            row = conn.execute(IDENTITY_SQL, {"name": self.url.database}).mappings().one()
            self.identity = Identity(self.url.database, row["oid"], row["owner"], marker)
            self.identity.verify(conn)
        self.engine = engine_for(self.url)
        with self.engine.connect() as conn:
            self.identity.verify(conn)
            tables = conn.execute(
                text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
            ).scalar_one()
            if tables:
                raise SafetyError("Fresh disposable database unexpectedly contains tables")
        return self

    def __exit__(self, *exc):
        if self.engine is not None:
            self.engine.dispose()
        try:
            if self.identity is not None:
                with self.admin.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                    self.identity.verify(conn)
                    conn.execute(
                        text(
                            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                            "WHERE datid=:oid AND pid<>pg_backend_pid()"
                        ),
                        {"oid": self.identity.oid},
                    )
                    name = self.admin.dialect.identifier_preparer.quote(self.identity.name)
                    conn.exec_driver_sql(f"DROP DATABASE {name}")
        finally:
            self.admin.dispose()


def safe_connection_label(url):
    """Non-secret diagnostic label; never render a password or arbitrary query arguments."""
    return f"postgresql://{url.host}:{url.port or 5432}/{quote(url.database, safe='')}"
