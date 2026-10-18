"""Descriptive overlays and rebuildable effective keyword projection. No backfill."""

import sqlalchemy as sa

from alembic import op

revision = "e6a8c0d2f434"
down_revision = "d5f7a9c1e323"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column(n, sa.DateTime(), nullable=False, server_default=sa.func.now())
        for n in ("created_at", "updated_at")
    ]


def owner_columns():
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "photo_id", sa.Integer(), sa.ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
    ]


def upgrade():
    fields, checks = [], []
    for name, limit in [
        ("title", 512),
        ("caption", 8192),
        ("creator", 512),
        ("copyright", 1024),
        ("keywords", 0),
    ]:
        fields += [
            sa.Column(name + "_mode", sa.String(8), nullable=False),
            sa.Column(name + "_value", sa.String(limit) if limit else sa.JSON(none_as_null=True)),
        ]
        condition = (
            f"({name}_mode IN ('inherit','clear') AND {name}_value IS NULL) OR "
            f"({name}_mode = 'override' AND {name}_value IS NOT NULL"
        )
        condition += (
            f" AND length({name}_value) BETWEEN 1 AND {limit})"
            if limit
            else " AND json_array_length(keywords_value) BETWEEN 0 AND 64"
            " AND length(CAST(keywords_value AS TEXT)) <= 65536)"
        )
        checks.append(sa.CheckConstraint(condition, name="ck_overlay_" + name))
    for i in range(64):
        checks.append(
            sa.CheckConstraint(
                sa.or_(
                    sa.column("keywords_mode") != "override",
                    sa.func.json_array_length(sa.column("keywords_value")) <= i,
                    sa.func.length(
                        sa.func.coalesce(sa.column("keywords_value", sa.JSON)[i].as_string(), "")
                    ).between(1, 128),
                ),
                name=f"ck_overlay_keyword_{i}",
            )
        )
    op.create_table(
        "photo_metadata_overlays",
        *owner_columns(),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        *fields,
        *timestamps(),
        *checks,
        sa.UniqueConstraint("photo_id", "user_id", name="uq_metadata_overlay_owner"),
        sa.CheckConstraint("revision >= 1", name="ck_overlay_revision"),
        sa.CheckConstraint("length(source_sha256) = 64", name="ck_overlay_sha"),
    )
    op.create_index("ix_photo_metadata_overlays_user_id", "photo_metadata_overlays", ["user_id"])
    op.create_table(
        "photo_keyword_states",
        *owner_columns(),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(32), nullable=False),
        sa.Column("overlay_revision", sa.Integer(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("photo_id", "user_id", name="uq_keyword_state_owner"),
        sa.CheckConstraint("overlay_revision >= 0", name="ck_keyword_revision"),
        sa.CheckConstraint("length(source_sha256) = 64", name="ck_keyword_sha"),
        sa.CheckConstraint("length(parser_version) BETWEEN 1 AND 32", name="ck_keyword_parser"),
    )
    op.create_index("ix_photo_keyword_states_user_id", "photo_keyword_states", ["user_id"])
    op.create_table(
        "photo_effective_keywords",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "state_id",
            sa.Integer(),
            sa.ForeignKey("photo_keyword_states.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("keyword_key", sa.String(256), nullable=False),
        sa.Column("display", sa.String(128), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("state_id", "keyword_key", name="uq_effective_keyword"),
        sa.UniqueConstraint("state_id", "position", name="uq_effective_position"),
        sa.CheckConstraint("position BETWEEN 0 AND 63", name="ck_effective_position"),
        sa.CheckConstraint("length(keyword_key) BETWEEN 1 AND 256", name="ck_keyword_key"),
        sa.CheckConstraint("length(display) BETWEEN 1 AND 128", name="ck_keyword_display"),
    )
    op.create_index(
        "ix_photo_effective_keywords_state_id", "photo_effective_keywords", ["state_id"]
    )
    op.create_index(
        "ix_photo_effective_keywords_keyword_key", "photo_effective_keywords", ["keyword_key"]
    )


def downgrade():
    op.drop_table("photo_effective_keywords")
    op.drop_table("photo_keyword_states")
    op.drop_table("photo_metadata_overlays")
