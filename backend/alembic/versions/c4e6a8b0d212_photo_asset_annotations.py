"""Private asset annotations; no backfill or changes to business tables."""
import sqlalchemy as sa
from alembic import op
revision = "c4e6a8b0d212"
down_revision = "b2d4a6c8e010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "photo_asset_annotations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("photo_id", sa.Integer(), sa.ForeignKey("photos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("color_label", sa.String(12), nullable=True),
        sa.Column("pick_status", sa.String(12), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("photo_id", "user_id", name="uq_photo_annotation_owner"),
        sa.CheckConstraint("rating >= 0 AND rating <= 5", name="ck_photo_annotation_rating"),
        sa.CheckConstraint("revision >= 0", name="ck_photo_annotation_revision"),
        sa.CheckConstraint("color_label IS NULL OR color_label IN ('red','yellow','green','blue','purple')", name="ck_photo_annotation_color"),
        sa.CheckConstraint("pick_status IN ('unmarked','pick','reject')", name="ck_photo_annotation_pick"),
    )
    op.create_index("ix_photo_asset_annotations_user_id", "photo_asset_annotations", ["user_id"])


def downgrade():
    op.drop_index("ix_photo_asset_annotations_user_id", table_name="photo_asset_annotations")
    op.drop_table("photo_asset_annotations")
