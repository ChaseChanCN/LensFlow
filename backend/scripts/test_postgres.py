"""Run the separate PostgreSQL suite, creating only a newly owned disposable database."""

import argparse
import importlib.util
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

from postgres_sandbox import OwnedPostgres, SafetyError, admin_configuration, safe_connection_label

BACKEND = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-postgres", action="store_true")
    parser.add_argument("pytest_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    extra = args.pytest_args
    if extra[:1] == ["--"]:
        extra = extra[1:]
    command = [
        sys.executable,
        "-m",
        "pytest",
        "-c",
        str(BACKEND / "tests/postgres/pytest.ini"),
        "--confcutdir=" + str(BACKEND / "tests/postgres"),
        str(BACKEND / "tests/postgres"),
        "-ra",
        *extra,
    ]
    try:
        config = admin_configuration()
    except SafetyError as exc:
        print(f"PostgreSQL harness refused: {exc}", file=sys.stderr)
        return 2
    available = config is not None and importlib.util.find_spec("psycopg2") is not None
    if not available:
        reason = (
            "No explicit disposable PostgreSQL administrator configuration"
            if config is None
            else "psycopg2 is not installed; install the declared postgres extra"
        )
        print(f"PostgreSQL integration unavailable: {reason}")
        if args.require_postgres:
            return 2
        environ = os.environ.copy()
        for name in tuple(environ):
            if name.startswith("LENSFLOW_PG_TEST_"):
                environ.pop(name)
        environ["LENSFLOW_PG_SKIP_REASON"] = reason
        return subprocess.call(command, cwd=BACKEND, env=environ)
    with tempfile.TemporaryDirectory(prefix="lensflow-pg-integration-") as root:
        with OwnedPostgres(config) as sandbox:
            environ = os.environ.copy()
            environ.update(sandbox.identity.environment(sandbox.url))
            environ.update(
                {
                    "STORAGE_TYPE": "local",
                    "STORAGE_LOCAL_PATH": str(Path(root) / "uploads"),
                    "JWT_SECRET_KEY": secrets.token_urlsafe(48),
                    "LENSFLOW_PG_TEST_TEMP_ROOT": root,
                }
            )
            print("Owned disposable PostgreSQL: " + safe_connection_label(sandbox.url), flush=True)
            try:
                return subprocess.call(command, cwd=BACKEND, env=environ)
            finally:
                print("Verifying ownership before disposable database cleanup", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
