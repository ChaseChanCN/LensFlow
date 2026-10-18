"""Own process engine, ordered row locks and real CAS races."""


def compete(ids, user_id, revisions, label, barrier, output, rebuild_only=False):
    from sqlalchemy import select

    from app.core.database import SessionLocal, engine
    from app.models.photo import Photo
    from app.models.user import User
    from app.schemas.metadata_overlay import BatchItem, Operation
    from app.services.metadata_overlay import mutate, rebuild

    try:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            barrier.wait(timeout=15)
            if rebuild_only:
                photos = db.scalars(select(Photo).where(Photo.id.in_(ids))).all()
                rebuild(db, user, photos)
                output.put({"rebuilt": True})
            else:
                result = mutate(
                    db,
                    user,
                    [BatchItem(photo_id=i, expected_revision=r) for i, r in zip(ids, revisions)],
                    operation=Operation(type="keywords_add", keywords=[label]),
                )
                output.put({"success": result["succeeded"], "conflict": result["conflicted"]})
    except Exception as exc:
        output.put(
            {
                "exception": type(exc).__name__,
                "sqlstate": getattr(getattr(exc, "orig", None), "pgcode", None),
            }
        )
    finally:
        engine.dispose()
