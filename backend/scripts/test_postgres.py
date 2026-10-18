"""Run the separate PostgreSQL suite, creating only a newly owned disposable database."""

import argparse
import getpass
import importlib.util
import os
import secrets
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

from postgres_sandbox import (
    ACK,
    OwnedPostgres,
    SafetyError,
    admin_configuration,
    safe_connection_label,
)
from sqlalchemy.engine import URL

BACKEND = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-postgres", action="store_true")
    parser.add_argument(
        "--prompt-password",
        action="store_true",
        help="Read a hidden password locally; never put it in a DSN argument",
    )
    parser.add_argument("--pg-user", default="postgres")
    parser.add_argument("--pg-port", type=int, default=5432)
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
        if args.prompt_password:
            if not sys.stdin.isatty():
                raise getpass.GetPassWarning("Hidden input requires an interactive terminal")
            # Explicit --prompt-password opts into newly created disposable databases only.
            # getpass normally falls back to echoing stdin on unsupported terminals.
            # Fail instead: this flag promises a hidden, interactive local input.
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                password = getpass.getpass("Local PostgreSQL test password (hidden): ")
            url = URL.create(
                "postgresql+psycopg2",
                username=args.pg_user,
                password=password,
                host="127.0.0.1",
                port=args.pg_port,
                database="postgres",
            )
            config = admin_configuration(
                {
                    "LENSFLOW_PG_TEST_ADMIN_DSN": url.render_as_string(hide_password=False),
                    "LENSFLOW_PG_TEST_ALLOW_CREATE": ACK,
                }
            )
        else:
            config = admin_configuration()
    except SafetyError as exc:
        print(f"PostgreSQL harness refused: {exc}", file=sys.stderr)
        return 2
    except (getpass.GetPassWarning, EOFError):
        print(
            "A local terminal with hidden input is required; refusing echoed input", file=sys.stderr
        )
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
