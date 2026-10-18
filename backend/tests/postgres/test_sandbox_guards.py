"""Pure guard tests run without PostgreSQL; never interpreted as PG integration passes."""

import pytest

from scripts.postgres_sandbox import (
    ACK,
    Identity,
    OwnedPostgres,
    SafetyError,
    admin_configuration,
    identity_from_environment,
)


def test_no_postgres_default_is_used():
    assert admin_configuration({}) is None
    assert identity_from_environment({}) is None


@pytest.mark.parametrize(
    "dsn",
    [
        "sqlite:///development.sqlite",
        "postgresql+psycopg2://user:password@127.0.0.1/lensflow",
        "postgresql+psycopg2://user:password@production.example/postgres",
        "postgresql+psycopg2://user:password@127.0.0.1/postgres?options=unsafe",
        "postgresql+psycopg2://127.0.0.1/postgres",
    ],
)
def test_explicit_configuration_rejects_non_disposable_targets(dsn):
    with pytest.raises(SafetyError):
        admin_configuration(
            {"LENSFLOW_PG_TEST_ADMIN_DSN": dsn, "LENSFLOW_PG_TEST_ALLOW_CREATE": ACK}
        )


def test_explicit_acknowledgement_is_required():
    with pytest.raises(SafetyError):
        admin_configuration(
            {"LENSFLOW_PG_TEST_ADMIN_DSN": "postgresql+psycopg2://u:p@127.0.0.1/postgres"}
        )


def test_database_name_alone_is_not_an_ownership_capability():
    with pytest.raises(SafetyError):
        identity_from_environment(
            {
                "LENSFLOW_PG_TEST_DSN": "postgresql+psycopg2://u:p@127.0.0.1/lensflow_test_"
                + "a" * 32
            }
        )


class FakeRows:
    def __init__(self, row):
        self.row = row

    def mappings(self):
        return self

    def one_or_none(self):
        return self.row


class FakeConnection:
    def __init__(self, row):
        self.row = row

    def execute(self, *args):
        return FakeRows(self.row)


@pytest.mark.parametrize("changed", ["oid", "owner", "actor", "marker"])
def test_cleanup_guard_checks_oid_owner_actor_and_nonce(changed):
    identity = Identity("lensflow_test_" + "a" * 32, 42, "owner", "nonce")
    row = {"oid": 42, "owner": "owner", "actor": "owner", "marker": "nonce"}
    identity.verify(FakeConnection(row))
    row[changed] = 999 if changed == "oid" else "different"
    with pytest.raises(SafetyError):
        identity.verify(FakeConnection(row))


def test_target_capability_rejects_query_override():
    name = "lensflow_test_" + "a" * 32
    with pytest.raises(SafetyError):
        identity_from_environment(
            {
                "LENSFLOW_PG_TEST_DSN": f"postgresql+psycopg2://u:p@127.0.0.1/{name}?host=remote",
                "LENSFLOW_PG_TEST_NAME": name,
                "LENSFLOW_PG_TEST_OID": "42",
                "LENSFLOW_PG_TEST_OWNER": "u",
                "LENSFLOW_PG_TEST_MARKER": "lensflow-pg-owned:" + "a" * 64,
            }
        )


def test_enter_failure_invokes_guarded_cleanup(monkeypatch):
    sandbox = object.__new__(OwnedPostgres)
    calls = []

    def fail(self):
        raise SafetyError("test-only creation failure")

    monkeypatch.setattr(OwnedPostgres, "_create", fail)
    monkeypatch.setattr(OwnedPostgres, "__exit__", lambda *args: calls.append(args))
    with pytest.raises(SafetyError):
        sandbox.__enter__()
    assert len(calls) == 1


def test_cleanup_refuses_ddl_after_identity_mismatch():
    class Connection(FakeConnection):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execution_options(self, **kwargs):
            return self

        def exec_driver_sql(self, statement):
            pytest.fail("DDL must never run after identity mismatch")

    class Engine:
        def connect(self):
            return Connection({"oid": 999, "owner": "owner", "actor": "owner", "marker": "nonce"})

        def dispose(self):
            pass

    sandbox = object.__new__(OwnedPostgres)
    sandbox.engine = None
    sandbox.admin = Engine()
    sandbox.identity = Identity("lensflow_test_" + "a" * 32, 42, "owner", "nonce")
    with pytest.raises(SafetyError):
        sandbox.__exit__(None, None, None)
