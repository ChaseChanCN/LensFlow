"""Real customer workflow over TCP; requires a verified fresh PostgreSQL capability."""

import argparse
import hashlib
import json
import secrets
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
from jose import jwt
from sqlalchemy import text

from scripts.postgres_sandbox import SafetyError, engine_for, identity_from_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8057)
    args = parser.parse_args()
    capability = identity_from_environment()
    if capability is None:
        raise SafetyError("Fresh owned PostgreSQL capability required")
    url, identity = capability
    verifier = engine_for(url)
    try:
        with verifier.connect() as connection:
            identity.verify(connection)
            if connection.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")):
                raise SafetyError("HTTP verification requires an empty owned database")
    finally:
        verifier.dispose()
    with socket.socket() as check:
        check.bind(("127.0.0.1", args.port))

    from alembic.config import Config

    from alembic import command
    from app.core.config import settings
    from app.core.database import SessionLocal, engine
    from app.models.photo import Photo
    from app.models.selection import SelectionItem
    from app.services.storage import LocalStorage

    if engine.url.database != identity.name:
        raise SafetyError("Application engine mismatch")
    command.upgrade(Config("alembic.ini"), "head")
    args.output.mkdir(parents=True, exist_ok=True)
    raw = Path("tests/fixtures/grace_hopper.jpg").read_bytes()
    before = hashlib.sha256(raw).hexdigest()
    checks = []
    timings = []
    password = secrets.token_urlsafe(24)
    log = (args.output / "http-server.log").open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(args.port),
        ],
        stdout=log,
        stderr=log,
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{args.port}", timeout=30) as client:
            for _ in range(100):
                try:
                    if client.get("/health").status_code == 200:
                        break
                except httpx.ConnectError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Isolated HTTP server failed to start")

            def request(method, path, expected=200, **kwargs):
                started = time.perf_counter()
                response = client.request(method, "/api/v1" + path, **kwargs)
                timings.append(
                    {
                        "method": method,
                        "path": path,
                        "status": response.status_code,
                        "ms": round((time.perf_counter() - started) * 1000, 2),
                    }
                )
                assert response.status_code == expected, (method, path, response.status_code)
                return response

            actors = {}
            for role, suffix in [
                ("photographer", "owner"),
                ("client", "customer"),
                ("client", "other"),
            ]:
                account = {
                    "email": f"d2-{suffix}@example.com",
                    "password": password,
                    "name": suffix,
                    "role": role,
                }
                registered = request("POST", "/auth/register", 201, json=account).json()
                login = request(
                    "POST", "/auth/login", json={"email": account["email"], "password": password}
                ).json()
                actors[suffix] = (
                    {"Authorization": "Bearer " + login["access_token"]},
                    registered["user"]["id"],
                )
            ph, puid = actors["owner"]
            ch, cuid = actors["customer"]
            other, _ = actors["other"]
            request("GET", "/auth/me", headers=ch)
            request("GET", "/customer/orders", 401)
            booking_body = {
                "shoot_type": "portrait",
                "preferred_date": "2026-12-31",
                "contact_info": "HTTP sandbox",
                "photographer_id": puid,
            }
            bh = {**ch, "Idempotency-Key": "http-lost-response-recovery"}
            booking = request("POST", "/bookings", 201, headers=bh, json=booking_body).json()
            retry = request("POST", "/bookings", 201, headers=bh, json=booking_body).json()
            assert retry["id"] == booking["id"]
            request(
                "POST", "/bookings", 409, headers=bh, json={**booking_body, "shoot_type": "changed"}
            )
            request("GET", f"/bookings/{booking['id']}", 403, headers=other)
            request(
                "PATCH",
                f"/bookings/{booking['id']}/confirm",
                headers=ph,
                json={"photographer_id": puid},
            )
            assert (
                request("GET", "/customer/bookings", headers=ch).json()["items"][0]["status"]
                == "confirmed"
            )
            order = request("GET", "/customer/orders?limit=1", headers=ch).json()["items"][0]
            oid = order["id"]
            request("GET", f"/customer/orders/{oid}", headers=ch)
            request("GET", f"/customer/orders/{oid}", 403, headers=other)
            for status in ["WAITING_SHOOT", "WAITING_UPLOAD"]:
                request(
                    "PATCH",
                    f"/orders/{oid}/status",
                    headers=ph,
                    json={"target_status": status, "action": "http_workflow"},
                )
            photo = request(
                "POST",
                f"/orders/{oid}/photos",
                201,
                headers=ph,
                files={"file": ("真实照片.jpg", raw, "image/jpeg")},
            ).json()["photo"]
            pid = photo["id"]
            request(
                "PATCH",
                f"/orders/{oid}/status",
                headers=ph,
                json={"target_status": "WAITING_REVIEW", "action": "review"},
            )
            selection = request(
                "POST",
                f"/orders/{oid}/selection-set",
                201,
                headers=ph,
                json={"photo_ids": [pid], "max_select": 1},
            ).json()
            catalog = request("GET", f"/customer/orders/{oid}/photos?limit=1", headers=ch).json()
            assert catalog["items"][0]["id"] == pid and "storage_key" not in json.dumps(catalog)
            scope = {"kind": "photo", "media_id": pid, "variant": "preview", "size": 1024}
            g = request("POST", "/customer/media-grants", 201, headers=ch, json=scope).json()
            mh = {"Authorization": "MediaGrant " + g["token"]}
            media = request("GET", "/customer/media", headers=mh)
            assert (
                media.headers["content-type"] == "image/jpeg"
                and "no-store" in media.headers["cache-control"]
            )
            request("POST", "/customer/media-grants", 403, headers=other, json=scope)
            request("GET", "/customer/media?variant=download", 422, headers=mh)
            claims = jwt.get_unverified_claims(g["token"])
            claims["exp"] = 1
            expired = jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256")
            request(
                "GET", "/customer/media", 401, headers={"Authorization": "MediaGrant " + expired}
            )
            su = f"/customer/orders/{oid}/selection"
            request(
                "PUT", su, headers=ch, json={"expected_revision": 0, "selected_photo_ids": [pid]}
            )
            conflict = request(
                "PUT", su, 409, headers=ch, json={"expected_revision": 0, "selected_photo_ids": []}
            ).json()
            assert conflict["detail"]["current"]["revision"] == 1
            request("POST", su + "/submit", headers=ch, json={"expected_revision": 1})
            request("POST", su + "/submit", headers=ch, json={"expected_revision": 1})
            task = request("GET", f"/orders/{oid}/retouch-tasks", headers=ph).json()[0]
            request(
                "POST",
                f"/retouch-tasks/{task['id']}/versions",
                201,
                headers=ph,
                files={"file": ("retouch.jpg", raw, "image/jpeg")},
            )
            request("POST", f"/orders/{oid}/confirm-retouch", headers=ch)
            assert not request("GET", f"/customer/orders/{oid}/deliveries", headers=ch).json()[
                "items"
            ]
            delivery = request(
                "POST",
                f"/orders/{oid}/delivery",
                201,
                headers=ph,
                files={"file": ("最终成片.jpg", raw, "image/jpeg")},
            ).json()
            item = request("GET", f"/customer/orders/{oid}/deliveries", headers=ch).json()["items"][
                0
            ]
            assert (
                item["id"] == delivery["id"]
                and item["size_bytes"] == len(raw)
                and "storage_key" not in item
            )
            dg = request(
                "POST",
                "/customer/media-grants",
                201,
                headers=ch,
                json={"kind": "delivery", "media_id": item["id"], "variant": "download"},
            ).json()
            dh = {"Authorization": "MediaGrant " + dg["token"]}
            final = request("GET", "/customer/media", headers=dh)
            assert final.content == raw
            # Revoke actual publication; no simulated response or permissive token validation.
            with SessionLocal() as db:
                from app.models.user import User

                db.get(User, cuid).is_active = False
                db.commit()
            request("GET", "/customer/media", 401, headers=dh)
            with SessionLocal() as db:
                db.get(User, cuid).is_active = True
                db.commit()
                stored = db.get(Photo, pid)
                with LocalStorage().open_read(stored.storage_key) as stream:
                    assert hashlib.file_digest(stream, "sha256").hexdigest() == before
                # Large album projection fixture, in this verified disposable DB only.
                extra = [
                    Photo(
                        order_id=oid,
                        filename=f"album-{i}.jpg",
                        storage_key=stored.storage_key,
                        mime="image/jpeg",
                        size_bytes=len(raw),
                    )
                    for i in range(1000)
                ]
                db.add_all(extra)
                db.flush()
                db.add_all(
                    [SelectionItem(selection_set_id=selection["id"], photo_id=p.id) for p in extra]
                )
                db.commit()
            count = 0
            after = 0
            for _ in range(21):
                album = request(
                    "GET", f"/customer/orders/{oid}/photos?limit=50&after={after}", headers=ch
                ).json()
                assert len(album["items"]) <= 50
                count += len(album["items"])
                if album["next_after"] is None:
                    break
                after = album["next_after"]
            assert count == 1001
            checks = [
                "real_login",
                "booking_retry",
                "booking_mismatch",
                "confirmed_booking",
                "order_ownership",
                "published_catalog",
                "private_preview",
                "scope_rejected",
                "expired_grant",
                "cross_device_conflict",
                "idempotent_selection_submit",
                "actual_retouch_workflow",
                "published_delivery",
                "full_final_byte_integrity",
                "immediate_user_revocation",
                "original_sha256",
                "1001_photo_sql_pagination",
            ]
            (args.output / "openapi.json").write_text(
                json.dumps(client.get("/openapi.json").json(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (args.output / "http.json").write_text(
                json.dumps(
                    {
                        "passed": checks,
                        "requests": timings,
                        "source_sha256": before,
                        "source_bytes": len(raw),
                        "final_sha256": hashlib.sha256(final.content).hexdigest(),
                        "port": args.port,
                        "real_tcp": True,
                        "album_rows": count,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(
                json.dumps(
                    {
                        "real_tcp": True,
                        "checks": len(checks),
                        "requests": len(timings),
                        "source_sha256": before,
                    }
                )
            )
    finally:
        process.terminate()
        process.wait(timeout=15)
        log.close()
        engine.dispose()


if __name__ == "__main__":
    main()
