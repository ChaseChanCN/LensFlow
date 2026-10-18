"""C4 real TCP/browser sandbox plus clearly labelled synthetic catalog measurements."""

import argparse
import hashlib
import json
import os
import statistics
import subprocess
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy import select, text

from scripts.postgres_sandbox import SafetyError, engine_for, identity_from_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--browser-stop", type=Path)
    parser.add_argument("--port", type=int, default=8055)
    args = parser.parse_args()
    capability = identity_from_environment()
    if capability is None:
        raise SafetyError("A new owned PostgreSQL capability is required")
    url, identity = capability
    verifier = engine_for(url)
    try:
        with verifier.connect() as conn:
            identity.verify(conn)
            if conn.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")):
                raise SafetyError("Only a fresh empty database is accepted")
    finally:
        verifier.dispose()
    from alembic.config import Config

    from alembic import command
    from app.core.database import SessionLocal, engine
    from app.core.security import hash_password
    from app.models.delivery import Delivery
    from app.models.order import Order
    from app.models.photo import Photo
    from app.models.photo_edit_draft import PhotoEditDraft
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.models.photo_metadata_overlay import PhotoEffectiveKeyword as Keyword
    from app.models.photo_metadata_overlay import PhotoKeywordState as State
    from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
    from app.models.user import User
    from app.schemas.catalog_filters import CatalogFilters
    from app.schemas.image_edit import EditParametersV2
    from app.schemas.metadata_overlay import BatchItem, Operation
    from app.services.metadata_index import index_values
    from app.services.metadata_overlay import mutate, parser_version, resolve_effective_metadata
    from app.services.metadata_sidecar import serialize_sidecar
    from app.services.photo_catalog import catalog_page, catalog_statement
    from app.services.photo_metadata import normalize_metadata
    from app.services.storage import LocalStorage
    from tests.metadata_samples import common_exif, inject, xmp_segment
    from tests.test_metadata_overlay import snapshot, validate_xmp

    if engine.url.database != identity.name:
        raise SafetyError("App engine identity mismatch")
    args.output.mkdir(parents=True, exist_ok=True)
    command.upgrade(Config("alembic.ini"), "head")
    raw = Path("tests/fixtures/grace_hopper.jpg").read_bytes()
    known = inject(
        common_exif(orientation=1),
        xmp_segment(
            '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">原始标题</rdf:li></rdf:Alt>'
            '</dc:title><dc:description><rdf:Alt><rdf:li xml:lang="x-default">原始说明'
            "</rdf:li></rdf:Alt></dc:description><dc:subject><rdf:Bag><rdf:li>人像"
            "</rdf:li><rdf:li>Studio</rdf:li></rdf:Bag></dc:subject>"
        ),
    )
    storage = LocalStorage()
    key = storage.save("actual-photograph.jpg", known, "image/jpeg")
    original = normalize_metadata(1, known)
    sha = hashlib.sha256(known).hexdigest()
    with SessionLocal() as db:
        for i, role, name in [
            (1, "photographer", "owner"),
            (2, "client", "client"),
            (3, "photographer", "other"),
        ]:
            db.add(
                User(
                    id=i,
                    email=f"c4-{name}@example.com",
                    name=name,
                    password_hash=hash_password("C4-browser-only-123"),
                    role=role,
                )
            )
        db.flush()
        db.add_all(
            [
                Order(id=1, booking_id=1, photographer_id=1, client_id=2, status="WAITING_UPLOAD"),
                Order(id=2, booking_id=2, photographer_id=3, client_id=2, status="WAITING_UPLOAD"),
            ]
        )
        db.flush()
        for i in range(1, 1008):
            db.add(
                Photo(
                    order_id=1,
                    filename=f"人像-{i:04}.jpg",
                    storage_key=key,
                    mime="image/jpeg",
                    size_bytes=len(known),
                    width=517,
                    height=606,
                )
            )
        db.add(
            Photo(
                order_id=2,
                filename="private.jpg",
                storage_key=key,
                mime="image/jpeg",
                size_bytes=len(known),
            )
        )
        db.flush()
        for i in range(1, 1008):
            state = State(
                photo_id=i,
                user_id=1,
                source_sha256=sha,
                parser_version=parser_version(),
                overlay_revision=0,
            )
            db.add(state)
            db.flush()
            db.add_all(
                [
                    Keyword(state_id=state.id, keyword_key=v.casefold(), display=v, position=p)
                    for p, v in enumerate(["人像", "Studio"])
                ]
            )
            from datetime import datetime, timezone

            from app.services.metadata_index import PARSER_VERSION

            db.add(
                Index(
                    photo_id=i,
                    revision=1,
                    status="indexed",
                    source_sha256=sha,
                    parser_version=PARSER_VERSION,
                    indexed_at=datetime.now(timezone.utc),
                    **index_values(original),
                )
            )
        db.add(
            PhotoEditDraft(
                photo_id=1,
                user_id=1,
                source_sha256=sha,
                revision=1,
                parameters_json=EditParametersV2().model_dump(),
            )
        )
        selection = SelectionSet(order_id=1, max_select=3)
        db.add(selection)
        db.flush()
        db.add_all(
            [
                SelectionItem(selection_set_id=selection.id, photo_id=1),
                SelectionSubmission(selection_set_id=selection.id, selected_photo_ids="[1]"),
                Delivery(order_id=1, storage_key="unchanged-fixture.zip", filename="existing.zip"),
            ]
        )
        db.commit()

    def protected():
        with engine.connect() as conn:
            return {
                name: [
                    list(row) for row in conn.execute(text(f'SELECT * FROM "{name}" ORDER BY id'))
                ]
                for name in [
                    "selection_sets",
                    "selection_items",
                    "selection_submissions",
                    "photo_edit_drafts",
                    "deliveries",
                    "retouch_tasks",
                    "retouch_versions",
                    "retouch_feedbacks",
                ]
            }

    business = protected()

    def hashes():
        return {
            str(p.relative_to(storage.base_path)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in Path(storage.base_path).rglob("*")
            if p.is_file() and ".derived" not in p.parts
        }

    before = hashes()
    server = None
    evidence = {
        "actual_tcp": True,
        "database": "PostgreSQL",
        "catalog_rows": 1007,
        "catalog_fixture": "Synthetic 1007 DB references to one real JPEG; "
        "explicitly constructed EXIF/XMP tags",
        "source_sha256": sha,
    }
    log = (args.output / "server.log").open("w", encoding="utf-8")
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
            assert client.get("/ready").status_code == 200
            auth = {}
            for name in ["owner", "client", "other"]:
                login = client.post(
                    "/api/v1/auth/login",
                    json={"email": f"c4-{name}@example.com", "password": "C4-browser-only-123"},
                )
                login.raise_for_status()
                auth[name] = {"Authorization": "Bearer " + login.json()["access_token"]}
            owner = auth["owner"]
            upload = client.post(
                "/api/v1/orders/1/photos",
                headers=owner,
                files={"file": ("real-upload.jpg", raw, "image/jpeg")},
            )
            upload.raise_for_status()
            uploaded = upload.json()["photo"]["id"]
            evidence["actual_upload_photo_id"] = uploaded
            baseline = hashes()
            for name, digest in before.items():
                assert baseline[name] == digest
            get = "/api/v1/photos/1/metadata-effective"
            put = "/api/v1/photos/1/metadata-overlay"
            initial = client.get(get, headers=owner)
            initial.raise_for_status()
            assert initial.json()["effective"]["keywords"] == ["人像", "Studio"]
            assert client.get(get).status_code == 401
            for actor in ["client", "other"]:
                assert client.put(put, headers=auth[actor], json=snapshot()).status_code == 403
            assert (
                client.get("/api/v1/photos/1008/metadata-effective", headers=owner).status_code
                == 403
            )
            request = snapshot(
                title={"mode": "override", "value": "北京 <纪实> & 作品"},
                caption={"mode": "clear"},
                keywords={"mode": "override", "value": ["人像", "Portfolio", "A&B"]},
            )
            start = time.perf_counter()
            saved = client.put(put, headers=owner, json=request)
            saved.raise_for_status()
            evidence["http_single_write_ms"] = round((time.perf_counter() - start) * 1000, 3)
            assert saved.json()["revision"] == 1 and saved.json()["effective"]["caption"] is None
            assert client.get(get, headers=owner).json()["effective"] == saved.json()["effective"]
            conflict = client.put(put, headers=owner, json=request)
            assert conflict.status_code == 409 and conflict.json()["current"]["revision"] == 1
            batch = {
                "items": [
                    {"photo_id": 1, "expected_revision": 1},
                    {"photo_id": 2, "expected_revision": 0},
                ],
                "operation": {"type": "keywords_add", "keywords": ["精选"]},
            }
            start = time.perf_counter()
            result = client.post(
                "/api/v1/photos/metadata-overlays/batch", headers=owner, json=batch
            )
            result.raise_for_status()
            assert result.json()["succeeded"] == 2
            evidence["http_batch_two_ms"] = round((time.perf_counter() - start) * 1000, 3)
            for pid in [1, 2]:
                annotation = client.put(
                    f"/api/v1/photos/{pid}/annotation",
                    headers=owner,
                    json={
                        "expected_revision": 0,
                        "rating": 4,
                        "color_label": "blue",
                        "pick_status": "pick",
                    },
                )
                annotation.raise_for_status()
            params = {
                "keywords": json.dumps(["精选", "人像"]),
                "rating_min": 3,
                "pick": "pick",
                "camera_model": "canon constructed sample",
                "captured_from": "2026-01-01",
                "limit": 1,
            }
            page = client.get("/api/v1/orders/1/photos/catalog", headers=owner, params=params)
            page.raise_for_status()
            assert page.json()["items"][0]["id"] == 1 and page.json()["has_more"]
            cursor = page.json()["next_cursor"]
            assert (
                client.get(
                    "/api/v1/orders/1/photos/catalog",
                    headers=owner,
                    params={**params, "cursor": cursor},
                ).json()["items"][0]["id"]
                == 2
            )
            assert (
                client.get(
                    "/api/v1/orders/1/photos/catalog",
                    headers=owner,
                    params={**params, "keywords": '["other"]', "cursor": cursor},
                ).status_code
                == 422
            )
            sidecar = client.get("/api/v1/photos/1/metadata-sidecar.xmp", headers=owner)
            sidecar.raise_for_status()
            assert (
                validate_xmp(sidecar.content) == client.get(get, headers=owner).json()["effective"]
            )
            assert b"PRIVATE-SERIAL" not in sidecar.content and b"GPS" not in sidecar.content
            (args.output / "verified-photo-1.xmp").write_bytes(sidecar.content)
            evidence.update(
                http_conflict_preserved=True,
                http_private_authorization=True,
                http_sql_combined_filter=True,
                xmp_independent_dom_roundtrip=True,
                xmp_private_redacted=True,
                xmp_bytes=len(sidecar.content),
            )
            # Database-only benchmarks, with a synthetic 1007-row catalog and real per-write reads.
            with SessionLocal() as db:
                user = db.get(User, 1)
                times = []
                for _ in range(5):
                    start = time.perf_counter()
                    catalog_page(db, 1, 1, 50, None, filters=CatalogFilters(keywords=("人像",)))
                    times.append((time.perf_counter() - start) * 1000)
                evidence["db_keyword_catalog_ms"] = {
                    "runs": 5,
                    "median": statistics.median(times),
                    "max": max(times),
                }
                start = time.perf_counter()
                mutate(
                    db,
                    user,
                    [BatchItem(photo_id=i, expected_revision=0) for i in range(10, 110)],
                    operation=Operation(type="keywords_add", keywords=["性能测试"]),
                )
                evidence["db_batch_100_with_source_reads_ms"] = (time.perf_counter() - start) * 1000
                statement = catalog_statement(
                    1, 1, CatalogFilters(keywords=("人像",)), True, 2**63 - 1
                ).limit(50)
                sql = str(statement.compile(db.get_bind(), compile_kwargs={"literal_binds": True}))
                plan = db.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql)).scalar()
                (args.output / "keyword-explain.json").write_text(
                    json.dumps(plan, indent=2, default=str)
                )
            times = []
            for _ in range(100):
                start = time.perf_counter()
                resolved = resolve_effective_metadata(original)
                times.append((time.perf_counter() - start) * 1000)
            evidence["pure_resolver_ms"] = {
                "runs": 100,
                "median": statistics.median(times),
                "max": max(times),
            }
            times = []
            for _ in range(100):
                start = time.perf_counter()
                data = serialize_sidecar(resolved["effective"])
                times.append((time.perf_counter() - start) * 1000)
            evidence["pure_xmp_ms"] = {
                "runs": 100,
                "median": statistics.median(times),
                "max": max(times),
                "bytes": len(data),
            }
            (args.output / "http-initial.json").write_text(json.dumps(evidence, indent=2))
            print("C4 actual PostgreSQL HTTP verified; browser fixture ready", flush=True)
            if args.browser_stop:
                deadline = time.monotonic() + 3600
                while not args.browser_stop.exists() and time.monotonic() < deadline:
                    if server.poll() is not None:
                        raise RuntimeError("Owned server exited")
                    time.sleep(0.2)
                if not args.browser_stop.exists():
                    raise TimeoutError("Browser window expired")
            assert protected() == business
            assert hashes() == baseline
            with engine.connect() as conn:
                assert conn.scalar(select(Photo.storage_key).where(Photo.id == 1)) == key
            evidence.update(
                source_files_unchanged=True,
                source_storage_key_unchanged=True,
                selection_delivery_retouch_draft_unchanged=True,
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
