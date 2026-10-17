"""Pure guard tests run without PostgreSQL; never interpreted as PG integration passes."""

import pytest

from scripts.postgres_sandbox import (
    ACK,
    Identity,
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
