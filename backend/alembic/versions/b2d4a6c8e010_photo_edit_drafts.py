"""Add isolated photo edit drafts; no existing business table is altered."""

import sqlalchemy as sa

from alembic import op

revision = "b2d4a6c8e010"
down_revision = "f3a1c2d4e5b6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "photo_edit_drafts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "photo_id", sa.Integer(), sa.ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("parameters_json", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("photo_id", "user_id", name="uq_photo_edit_draft_owner"),
        sa.CheckConstraint("revision >= 0", name="ck_photo_edit_draft_revision"),
    )
    op.create_index("ix_photo_edit_drafts_photo_id", "photo_edit_drafts", ["photo_id"])
    op.create_index("ix_photo_edit_drafts_user_id", "photo_edit_drafts", ["user_id"])


def downgrade():
    op.drop_index("ix_photo_edit_drafts_user_id", table_name="photo_edit_drafts")
    op.drop_index("ix_photo_edit_drafts_photo_id", table_name="photo_edit_drafts")
    op.drop_table("photo_edit_drafts")
