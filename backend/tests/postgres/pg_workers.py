"""Spawn-safe worker targets. Each process imports its own engine and owns its session."""

import time


def _pause(ready):
    ready.set()
    while True:
        time.sleep(0.1)


def compete(operation, photo_id, user_id, expected, rating, barrier, output):
    from sqlalchemy import text

    from app.core.database import SessionLocal, engine
    from app.models.user import User
    from app.schemas.photo_annotation import BatchItem
    from app.services import metadata_index
    from app.services.photo_annotation import write_annotations

    try:
        with SessionLocal() as db:
            db.execute(text("SET statement_timeout='10000ms'"))
            db.execute(text("SET lock_timeout='5000ms'"))
            db.commit()
            barrier.wait(timeout=15)
            if operation == "claim":
                token, _ = metadata_index.claim(db, photo_id)
                output.put({"claimed": token is not None})
            elif operation == "annotation":
                owner = db.get(User, user_id)
                result = write_annotations(
                    db,
                    owner,
                    [BatchItem(photo_id=photo_id, expected_revision=expected)],
                    {"rating": rating},
                )
                output.put({"success": result.succeeded, "conflict": result.conflicted})
            else:
                raise ValueError("Unknown test operation")
    except Exception as exc:
        output.put({"exception": type(exc).__name__})
    finally:
        engine.dispose()


def interrupt_at(stage, photo_id, storage_key, ready):
    from app.core.database import SessionLocal, engine
    from app.services import metadata_index

    try:
        with SessionLocal() as db:
            commits = 0
            commit = db.commit

            def commit_at_boundary():
                nonlocal commits
                commits += 1
                if (commits == 1 and stage == "before_claim_commit") or (
                    commits == 2 and stage == "before_publish_commit"
                ):
                    _pause(ready)
                commit()
                if (commits == 1 and stage == "after_claim_commit") or (
                    commits == 2 and stage == "after_publish_commit"
                ):
                    _pause(ready)

            db.commit = commit_at_boundary
            if stage == "during_parse":

                def blocked_parser(*args):
                    _pause(ready)

                metadata_index.normalize_metadata = blocked_parser
            metadata_index.index_photo(db, photo_id, storage_key)
    finally:
        engine.dispose()
