"""Isolated rebuildable metadata index; no backfill or business table alterations."""

import sqlalchemy as sa

from alembic import op

revision = "d5f7a9c1e323"
down_revision = "c4e6a8b0d212"
branch_labels = None
depends_on = None


def upgrade():
    remainder = "source_sha256"
    for digit in "0123456789abcdef":
        remainder = f"replace({remainder}, '{digit}', '')"
    op.create_table(
        "photo_metadata_indexes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "photo_id",
            sa.Integer(),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("source_sha256", sa.String(64)),
        sa.Column("parser_version", sa.String(32), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        *[
            sa.Column(name, sa.String(160))
            for name in ("camera_make", "camera_model", "lens_make", "lens_model")
        ],
        sa.Column("iso", sa.Integer()),
        *[
            sa.Column(name, sa.Float())
            for name in ("focal_length_mm", "f_number", "exposure_seconds")
        ],
        sa.Column("capture_datetime_local", sa.String(32)),
        sa.Column("capture_timezone_offset_minutes", sa.Integer()),
        sa.Column("capture_date", sa.Date()),
        sa.Column("capture_timezone_known", sa.Boolean(), nullable=False),
        sa.Column("indexed_at", sa.DateTime()),
        sa.Column("error_code", sa.String(40)),
        sa.Column("lease_token", sa.String(32)),
        sa.Column("lease_expires_at", sa.DateTime()),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("warning_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('pending','indexed','unsupported','failed')", name="ck_metadata_status"
        ),
        sa.CheckConstraint(
            f"source_sha256 IS NULL OR (length(source_sha256)=64 AND length({remainder})=0)",
            name="ck_metadata_sha",
        ),
        sa.CheckConstraint("length(parser_version) BETWEEN 1 AND 32", name="ck_metadata_parser"),
        sa.CheckConstraint("revision >= 0", name="ck_metadata_revision"),
        sa.CheckConstraint("iso IS NULL OR iso BETWEEN 1 AND 10000000", name="ck_metadata_iso"),
        sa.CheckConstraint(
            "f_number IS NULL OR f_number BETWEEN 0.1 AND 1024", name="ck_metadata_aperture"
        ),
        sa.CheckConstraint(
            "focal_length_mm IS NULL OR focal_length_mm BETWEEN 0.1 AND 100000",
            name="ck_metadata_focal",
        ),
        sa.CheckConstraint(
            "exposure_seconds IS NULL OR exposure_seconds BETWEEN 0.0000001 AND 86400",
            name="ck_metadata_exposure",
        ),
        sa.CheckConstraint(
            "capture_timezone_offset_minutes IS NULL OR "
            "capture_timezone_offset_minutes BETWEEN -840 AND 840",
            name="ck_metadata_offset",
        ),
        sa.CheckConstraint(
            "(capture_timezone_known = false AND capture_timezone_offset_minutes IS NULL) OR "
            "(capture_timezone_known = true AND capture_timezone_offset_minutes IS NOT NULL)",
            name="ck_metadata_timezone",
        ),
        sa.CheckConstraint(
            "status != 'indexed' OR (source_sha256 IS NOT NULL AND indexed_at IS NOT NULL)",
            name="ck_metadata_complete",
        ),
    )
    for name in ("camera_model", "lens_model", "capture_date"):
        op.create_index(f"ix_photo_metadata_indexes_{name}", "photo_metadata_indexes", [name])


def downgrade():
    op.drop_table("photo_metadata_indexes")
