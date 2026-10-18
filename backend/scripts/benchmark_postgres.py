"""Bounded metadata-only benchmark; requires a launcher-owned, empty PostgreSQL database."""

import argparse
import json
import statistics
import time
from datetime import date
from pathlib import Path

from sqlalchemy import event, text

from scripts.postgres_sandbox import SafetyError, engine_for, identity_from_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    capability = identity_from_environment()
    if capability is None:
        raise SafetyError("A newly owned PostgreSQL sandbox is required")
    url, identity = capability
    verifier = engine_for(url)
    try:
        with verifier.connect() as connection:
            identity.verify(connection)
            if connection.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")):
                raise SafetyError("Benchmark requires a fresh empty sandbox")
    finally:
        verifier.dispose()

    from alembic.config import Config

    from alembic import command
    from app.core.database import SessionLocal, engine
    from app.models.order import Order
    from app.models.photo import Photo
    from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.models.user import User
    from app.schemas.catalog_filters import normalize_filters
    from app.schemas.metadata_filters import normalize_metadata_filters
    from app.services.metadata_index import PARSER_VERSION, index_counts, utcnow
    from app.services.metadata_issues import list_issues
    from app.services.metadata_search import facets, timeline
    from app.services.photo_catalog import catalog_page

    if engine.url.database != identity.name:
        raise SafetyError("Application target differs from the verified sandbox")
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    measurements = []
    try:
        with SessionLocal() as db:
            db.add_all(
                [
                    User(
                        id=i,
                        email=f"bench-{i}@test.invalid",
                        name="Benchmark",
                        password_hash="unused",
                        role="photographer",
                    )
                    for i in (1, 2)
                ]
            )
            db.flush()
            db.add_all(
                [
                    Order(
                        id=i, booking_id=i, photographer_id=i, client_id=1, status="WAITING_UPLOAD"
                    )
                    for i in (1, 2)
                ]
            )
            db.commit()
            previous = 0
            for total in (1000, 10000):
                photos, indexes, annotations = [], [], []
                for i in range(previous + 1, total + 1):
                    photos.append(
                        dict(
                            id=i,
                            order_id=2 if i % 10 == 0 else 1,
                            filename=f"人像-{i}.jpg",
                            storage_key="synthetic-not-read",
                            size_bytes=1,
                        )
                    )
                    if i % 11:
                        status = (
                            "pending"
                            if i % 13 == 0
                            else "failed"
                            if i % 17 == 0
                            else "unsupported"
                            if i % 19 == 0
                            else "indexed"
                        )
                        indexes.append(
                            dict(
                                photo_id=i,
                                parser_version=PARSER_VERSION,
                                status=status,
                                source_sha256="a" * 64 if status == "indexed" else None,
                                indexed_at=utcnow() if status == "indexed" else None,
                                error_code="NOT_FOUND" if status == "failed" else None,
                                warning_count=int(status == "indexed" and i % 23 == 0),
                                camera_make=f"manufacturer-{i % 3}",
                                camera_model=f"model-{i % 3}",
                                lens_model=f"镜头-{i % 5}",
                                iso=[100, 200, 400, 800, 1600, 3200][i % 6],
                                f_number=[1.8, 2.8, 4, 5.6, 8][i % 5],
                                focal_length_mm=[24, 35, 50, 85, 200][i % 5],
                                capture_date=None
                                if i % 7 == 0
                                else date(
                                    2023 + (i // 37) % 4, 1 + (i // 7) % 12, 1 + (i // 17) % 28
                                ),
                            )
                        )
                    if i % 4:
                        annotations.append(
                            dict(
                                photo_id=i,
                                user_id=1,
                                rating=i % 6,
                                pick_status="pick" if i % 3 else "unmarked",
                                revision=1,
                            )
                        )
                db.bulk_insert_mappings(Photo, photos)
                db.bulk_insert_mappings(Index, indexes)
                db.bulk_insert_mappings(Annotation, annotations)
                db.commit()
                db.execute(text("ANALYZE"))
                db.commit()
                filters = normalize_filters(
                    rating_min=3,
                    pick="pick",
                    metadata=normalize_metadata_filters(
                        {"camera_model": "model-1", "iso_min": "100", "aperture_max": "8"}
                    ),
                )
                operations = [
                    ("filtered-catalog", lambda: catalog_page(db, 1, 1, 50, None, filters=filters)),
                    (
                        "rating-desc",
                        lambda: catalog_page(
                            db, 1, 1, 50, None, filters=normalize_filters(sort="rating_desc")
                        ),
                    ),
                    (
                        "created-desc",
                        lambda: catalog_page(
                            db, 1, 1, 50, None, filters=normalize_filters(sort="created_desc")
                        ),
                    ),
                    ("facets", lambda: facets(db, 1)),
                    ("timeline-year", lambda: timeline(db, 1, 1, filters, "year")),
                    ("timeline-month", lambda: timeline(db, 1, 1, filters, "month", 2025)),
                    ("timeline-day", lambda: timeline(db, 1, 1, filters, "day", 2025, 2)),
                    ("completeness", lambda: index_counts(db, 1)),
                    (
                        "issues",
                        lambda: list_issues(db, 1, 1, "failed,unsupported,warnings", 20, None),
                    ),
                ]
                for name, action in operations:
                    traces, samples = [], []

                    def capture(conn, cursor, statement, params, context, many):
                        if statement.lstrip().upper().startswith("SELECT"):
                            traces.append((statement, params))

                    event.listen(engine, "before_cursor_execute", capture)
                    try:
                        for _ in range(5):
                            started = time.perf_counter()
                            result = action()
                            samples.append((time.perf_counter() - started) * 1000)
                    finally:
                        event.remove(engine, "before_cursor_execute", capture)
                    plans = []
                    for statement, params in {sql: args for sql, args in traces}.items():
                        plan = (
                            db.connection()
                            .exec_driver_sql(
                                "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, params
                            )
                            .scalar_one()
                        )
                        plans.append({"sql": statement, "plan": plan})
                    measurements.append(
                        {
                            "records": total,
                            "tenant_records": total * 9 // 10,
                            "operation": name,
                            "iterations": 5,
                            "sql_queries": len(traces) / 5,
                            "median_ms": round(statistics.median(samples), 3),
                            "max_ms": round(max(samples), 3),
                            "plans": plans,
                            "result": result.model_dump(mode="json"),
                        }
                    )
                previous = total
        args.output.write_text(
            json.dumps(
                {
                    "database": "PostgreSQL",
                    "metadata_only": True,
                    "jpeg_throughput_test": False,
                    "measurements": measurements,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"PostgreSQL EXPLAIN ANALYZE: {len(measurements)} measurements written")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
