"""Customer booking retry keys and revisioned selection companion state. No backfill."""

import sqlalchemy as sa

from alembic import op

revision = "f7b9d1e3a545"
down_revision = "e6a8c0d2f434"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "booking_request_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column(
            "booking_id",
            sa.Integer(),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "key_hash", name="uq_booking_request_user_key"),
    )
    op.create_index("ix_booking_request_keys_user_id", "booking_request_keys", ["user_id"])
    op.create_index("ix_booking_request_keys_expires_at", "booking_request_keys", ["expires_at"])
    op.create_table(
        "customer_selection_drafts",
        sa.Column(
            "selection_set_id",
            sa.Integer(),
            sa.ForeignKey("selection_sets.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("selected_photo_ids", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("revision > 0", name="ck_customer_selection_revision"),
    )
    op.create_index(
        "ix_customer_selection_drafts_user_id", "customer_selection_drafts", ["user_id"]
    )


def downgrade():
    op.drop_table("customer_selection_drafts")
    op.drop_table("booking_request_keys")
