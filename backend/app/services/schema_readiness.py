"""Non-destructive DAM schema readiness. Never creates tables or runs migrations."""

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

REQUIRED_REVISION = "f7b9d1e3a545"
REQUIRED_TABLES = {
    "booking_request_keys": {"user_id", "key_hash", "booking_id", "expires_at"},
    "customer_selection_drafts": {"selection_set_id", "user_id", "revision", "selected_photo_ids"},
    "photo_metadata_overlays": {"photo_id", "user_id", "revision", "source_sha256", "keywords_mode"},
    "photo_keyword_states": {"photo_id", "user_id", "overlay_revision", "parser_version", "source_sha256"},
    "photo_effective_keywords": {"state_id", "keyword_key", "position"},
    "photo_metadata_indexes": {
        "photo_id",
        "lease_token",
        "lease_expires_at",
        "revision",
        "warning_count",
    },
    "photo_asset_annotations": {"photo_id", "user_id", "revision"},
    "photo_edit_drafts": {"photo_id", "revision"},
}


def schema_ready(engine):
    try:
        with engine.connect() as connection:
            inspector = inspect(connection)
            tables = set(inspector.get_table_names())
            if "alembic_version" not in tables or not REQUIRED_TABLES.keys() <= tables:
                return False
            for table, required in REQUIRED_TABLES.items():
                if not required <= {column["name"] for column in inspector.get_columns(table)}:
                    return False
            revisions = connection.scalars(text("SELECT version_num FROM alembic_version")).all()
            return revisions == [REQUIRED_REVISION]
    except SQLAlchemyError:
        return False
