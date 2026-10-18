"""Real TCP HTTP and optional browser fixture, only in a fresh launcher-owned PostgreSQL DB."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image
from sqlalchemy import text

from scripts.postgres_sandbox import SafetyError, engine_for, identity_from_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--browser-stop", type=Path)
    parser.add_argument("--port", type=int, default=8054)
    args = parser.parse_args()
    capability = identity_from_environment()
    if capability is None:
        raise SafetyError("A fresh launcher-owned PostgreSQL database is required")
    url, identity = capability
    verifier = engine_for(url)
    try:
        with verifier.connect() as connection:
            identity.verify(connection)
            if connection.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")):
                raise SafetyError("HTTP fixture requires a fresh empty sandbox")
    finally:
        verifier.dispose()

    from alembic.config import Config

    from alembic import command
    from app.core.database import SessionLocal, engine
    from app.core.security import hash_password
    from app.models.delivery import Delivery
    from app.models.order import Order
    from app.models.photo import Photo
    from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
    from app.models.user import User
    from app.services.storage import LocalStorage
    from tests.metadata_samples import XMP_HEADER, exif_segment, inject, segment

    if engine.url.database != identity.name:
        raise SafetyError("Application database does not match owned capability")
    args.output.mkdir(parents=True, exist_ok=True)
    command.upgrade(Config("alembic.ini"), "head")
    fixture = Path("tests/fixtures/grace_hopper.jpg")
    raw = fixture.read_bytes()
    known = inject(
        exif_segment(
            [(271, 2, "Canon"), (272, 2, "EOS 70D")],
            [
                (34855, 3, 400),
                (37386, 5, [(50, 1)]),
                (33437, 5, [(28, 10)]),
                (36867, 2, "2026:01:02 00:30:00"),
                (36881, 2, "+14:00"),
                (37521, 2, "123456789"),
            ],
        )
    )
    warning = inject(
        segment(
            0xE1, XMP_HEADER + b'<!DOCTYPE x [<!ENTITY private SYSTEM "file:///NOT-READ">]><x/>'
        )
    )
    storage = LocalStorage()
    keys = [
        storage.save(f"source-{i}.jpg", data, "image/jpeg")
        for i, data in enumerate((raw, known, warning))
    ]
    invalid = storage.save("invalid.jpg", b"\xff\xd8invalid", "image/jpeg")
    unsupported = storage.save("unsupported.png", b"not-jpeg", "image/png")
    with SessionLocal() as db:
        db.add_all(
            [
                User(
                    id=i,
                    email=f"pg-{name}@example.com",
                    name=name,
                    password_hash=hash_password("D1-browser-only-123"),
                    role=role,
                )
                for i, name, role in [
                    (1, "owner", "photographer"),
                    (2, "client", "client"),
                    (3, "other", "photographer"),
                ]
            ]
        )
        db.flush()
        db.add_all(
            [
                Order(id=1, booking_id=1, photographer_id=1, client_id=2, status="WAITING_UPLOAD"),
                Order(id=2, booking_id=2, photographer_id=3, client_id=2, status="WAITING_UPLOAD"),
            ]
        )
        db.flush()
        for i in range(70):
            key = invalid if i == 0 else unsupported if i == 1 else keys[i % 3]
            db.add(
                Photo(
                    order_id=1,
                    filename=f"人像-{i + 1:03}.jpg",
                    storage_key=key,
                    mime="image/jpeg",
                    size_bytes=len(raw),
                    width=517,
                    height=606,
                )
            )
        db.add(
            Photo(order_id=2, filename="other-order.jpg", storage_key=keys[0], size_bytes=len(raw))
        )
        selection = SelectionSet(order_id=1, max_select=3)
        db.add(selection)
        db.flush()
        db.add(SelectionItem(selection_set_id=selection.id, photo_id=3))
        db.add(SelectionSubmission(selection_set_id=selection.id, selected_photo_ids="[3]"))
        db.add(Delivery(order_id=1, storage_key="fixture-not-downloaded", filename="existing.zip"))
        db.commit()

    def protected_business():
        with engine.connect() as connection:
            return {
                name: [
                    list(row)
                    for row in connection.execute(text(f'SELECT * FROM "{name}" ORDER BY id'))
                ]
                for name in (
                    "selection_sets",
                    "selection_items",
                    "selection_submissions",
                    "deliveries",
                    "retouch_tasks",
                    "retouch_versions",
                    "retouch_feedbacks",
                )
            }

    def source_hashes():
        return {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in Path(storage.base_path).iterdir()
            if p.is_file()
        }

    business_before = protected_business()
    seed_hashes = source_hashes()
    server = None
    log = (args.output / "http-server.log").open("w", encoding="utf-8")
    try:
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.port),
                "--log-level",
                "warning",
            ],
            env=os.environ.copy(),
            stdout=log,
            stderr=log,
        )
        with httpx.Client(base_url=f"http://127.0.0.1:{args.port}", timeout=45) as client:
            for _ in range(200):
                try:
                    if client.get("/ready").status_code == 200:
                        break
                except httpx.ConnectError:
                    pass
                if server.poll() is not None:
                    raise RuntimeError("Owned HTTP server exited")
                time.sleep(0.1)
            assert client.get("/health").status_code == client.get("/ready").status_code == 200
            headers = {}
            for name in ("owner", "client", "other"):
                response = client.post(
                    "/api/v1/auth/login",
                    json={"email": f"pg-{name}@example.com", "password": "D1-browser-only-123"},
                )
                response.raise_for_status()
                headers[name] = {"Authorization": "Bearer " + response.json()["access_token"]}
            owner = headers["owner"]
            uploaded = []
            for name, data in (("real-photograph.jpg", raw), ("known-exif.jpg", known)):
                response = client.post(
                    "/api/v1/orders/1/photos",
                    headers=owner,
                    files={"file": (name, data, "image/jpeg")},
                )
                response.raise_for_status()
                pid = response.json()["photo"]["id"]
                uploaded.append(pid)
                index = client.post(f"/api/v1/photos/{pid}/metadata-index", headers=owner, json={})
                index.raise_for_status()
                assert index.json()["source_sha256"] == hashlib.sha256(data).hexdigest()
                with Image.open(BytesIO(data)) as image:
                    expected = image.getexif().get(272)
                assert index.json()["camera_model"] == (expected.lower() if expected else None)
                for path in (
                    f"/api/v1/photos/{pid}/thumbnail?size=256",
                    f"/api/v1/photos/{pid}/preview",
                ):
                    response = client.get(path, headers=owner)
                    response.raise_for_status()
                    assert response.headers["content-type"].startswith("image/jpeg")
                    assert (
                        "no-store" in response.headers["cache-control"]
                        or "private" in response.headers["cache-control"]
                    )
                    with Image.open(BytesIO(response.content)) as image:
                        assert max(image.size) <= 1024
                assert (
                    client.get(f"/api/v1/photos/{pid}/metadata", headers=owner).status_code == 200
                )
                with SessionLocal() as check:
                    stored = check.get(Photo, pid)
                    stored_hash = hashlib.sha256(
                        Path(storage.get_path(stored.storage_key)).read_bytes()
                    ).hexdigest()
                    assert stored_hash == hashlib.sha256(data).hexdigest()
            before_processing = source_hashes()
            assert all(before_processing[name] == digest for name, digest in seed_hashes.items())
            cursor = None
            while True:
                response = client.post(
                    "/api/v1/orders/1/metadata-index",
                    headers=owner,
                    json={"limit": 10, "cursor": cursor},
                )
                response.raise_for_status()
                cursor = response.json()["next_cursor"]
                if not cursor:
                    break
            status = client.get("/api/v1/orders/1/metadata-index/status", headers=owner).json()
            assert status["indexed"] == 70 and status["failed"] == status["unsupported"] == 1, (
                status
            )
            with ThreadPoolExecutor(max_workers=12) as executor:
                concurrent = list(
                    executor.map(
                        lambda _: (
                            client.get(
                                "/api/v1/orders/1/metadata-index/status", headers=owner
                            ).status_code
                        ),
                        range(12),
                    )
                )
            assert concurrent == [200] * 12
            for path in (
                "photos/catalog?camera_model=eos+70d",
                "photos/metadata-facets",
                "photos/timeline",
                "metadata-index/issues",
            ):
                response = client.get("/api/v1/orders/1/" + path, headers=owner)
                response.raise_for_status()
            timeline = client.get("/api/v1/orders/1/photos/timeline", headers=owner).json()
            assert timeline["buckets"][0]["date"] == "2026"
            for role in ("client", "other"):
                assert (
                    client.get(
                        "/api/v1/orders/1/metadata-index/issues", headers=headers[role]
                    ).status_code
                    == 403
                )
                assert (
                    client.post(
                        "/api/v1/photos/3/metadata-index", headers=headers[role], json={}
                    ).status_code
                    == 403
                )
            assert client.get("/api/v1/photos/3/thumbnail").status_code == 401
            assert client.get("/api/v1/orders/2/photos/catalog", headers=owner).status_code == 403
            assert (
                client.get("/api/v1/orders/1/photos/catalog", headers=headers["client"]).status_code
                == 200
            )
            pid = uploaded[0]
            annotation = client.put(
                f"/api/v1/photos/{pid}/annotation",
                headers=owner,
                json={
                    "expected_revision": 0,
                    "rating": 4,
                    "color_label": "green",
                    "pick_status": "pick",
                },
            )
            annotation.raise_for_status()
            assert annotation.json()["revision"] == 1
            from datetime import datetime, timezone

            timestamp = datetime.fromisoformat(annotation.json()["updated_at"])
            assert abs((timestamp - datetime.now(timezone.utc)).total_seconds()) < 5
            assert (
                client.put(
                    f"/api/v1/photos/{pid}/annotation",
                    headers=owner,
                    json={
                        "expected_revision": 0,
                        "rating": 1,
                        "color_label": None,
                        "pick_status": "unmarked",
                    },
                ).status_code
                == 409
            )
            # Send a real TCP write, then discard its body instead of consuming
            # the committed response. Read-back must reveal revision 2; replay
            # with the uncertain old revision must return a real HTTP conflict.
            with client.stream(
                "PUT",
                f"/api/v1/photos/{pid}/annotation",
                headers=owner,
                json={
                    "expected_revision": 1,
                    "rating": 5,
                    "color_label": "green",
                    "pick_status": "pick",
                },
            ) as uncertain:
                assert uncertain.status_code == 200
            persisted = client.get(f"/api/v1/photos/{pid}/annotation", headers=owner).json()
            assert persisted["revision"] == 2 and persisted["rating"] == 5
            assert (
                client.put(
                    f"/api/v1/photos/{pid}/annotation",
                    headers=owner,
                    json={
                        "expected_revision": 1,
                        "rating": 1,
                        "color_label": None,
                        "pick_status": "unmarked",
                    },
                ).status_code
                == 409
            )
            export = client.post(
                f"/api/v1/photos/{pid}/export",
                headers=owner,
                json={
                    "edit": {
                        "schema_version": 1,
                        "exposure_ev": 0.5,
                        "contrast": 10,
                        "saturation": -10,
                    }
                },
            )
            export.raise_for_status()
            with Image.open(BytesIO(export.content)) as image:
                assert image.size == (517, 606) and image.format == "JPEG"
            baseline = source_hashes()
            assert baseline == before_processing
            evidence = {
                "database": "PostgreSQL",
                "actual_tcp": True,
                "port": args.port,
                "actual_uploads": uploaded,
                "independent_pillow_metadata": True,
                "status": status,
                "authentication_authorization": True,
                "annotation_cas": True,
                "concurrent_http_requests": len(concurrent),
                "commit_then_response_body_discarded": True,
                "annotation_updated_at_utc": timestamp.isoformat(),
                "full_size_export": [517, 606],
                "source_files": len(baseline),
                "source_hashes_before_processing_and_after_export_equal": True,
                "camera_original_metadata": False,
                "sample_note": "Real Grace Hopper JPEG; explicitly constructed EXIF/XMP variants",
            }
            (args.output / "http-initial.json").write_text(json.dumps(evidence, indent=2))
            print("Real PostgreSQL HTTP verified; browser fixture ready", flush=True)
            if args.browser_stop:
                # Finite browser window. Only this script's child process is stopped.
                deadline = time.monotonic() + 3600
                while not args.browser_stop.exists() and time.monotonic() < deadline:
                    if server.poll() is not None:
                        raise RuntimeError("Owned HTTP server exited during browser check")
                    time.sleep(0.2)
                if not args.browser_stop.exists():
                    raise TimeoutError("Browser verification window expired")
            assert source_hashes() == baseline
            assert protected_business() == business_before
            evidence.update(
                source_files_unchanged=True,
                selection_delivery_retouch_unchanged=True,
                browser_claim="See separate browser evidence; HTTP is not a browser test",
            )
            (args.output / "http-final.json").write_text(json.dumps(evidence, indent=2))
    finally:
        if server is not None and server.poll() is None:
            server.terminate()
            server.wait(timeout=15)
        log.close()
        engine.dispose()


if __name__ == "__main__":
    main()
