"""Verified +86 phone identities, finite OTPs, durable sending quotas."""

import sqlalchemy as sa

from alembic import op

revision = "a8c0e2f4b656"
down_revision = "f7b9d1e3a545"
branch_labels = None
depends_on = None


def sqlite_guard():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite" and conn.exec_driver_sql("PRAGMA foreign_keys").scalar():
        raise RuntimeError(
            "Refusing users rebuild with SQLite foreign_keys=ON; "
            "use an offline Alembic migration connection"
        )


def check_foreign_keys():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite" and conn.exec_driver_sql("PRAGMA foreign_key_check").first():
        raise RuntimeError(
            "Foreign-key integrity check failed; review the offline migration backup"
        )


def upgrade():
    sqlite_guard()
    with op.batch_alter_table("users") as batch:
        batch.alter_column("email", existing_type=sa.String(255), nullable=True)
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
    op.create_table(
        "phone_identities",
        sa.Column("phone", sa.String(16), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("verified_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "sms_challenges",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("purpose", sa.String(8), nullable=False),
        sa.Column("code_digest", sa.String(64), nullable=False),
        sa.Column("state", sa.String(8), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime()),
        sa.CheckConstraint("purpose IN ('register','login')", name="ck_sms_purpose"),
        sa.CheckConstraint("state IN ('sending','sent','failed','unknown')", name="ck_sms_state"),
        sa.CheckConstraint("attempts BETWEEN 0 AND 5", name="ck_sms_attempts"),
    )
    op.create_index("ix_sms_challenges_phone", "sms_challenges", ["phone"])
    op.create_index("ix_sms_challenges_expires_at", "sms_challenges", ["expires_at"])
    op.create_table(
        "sms_rate_buckets",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("count >= 0", name="ck_sms_rate_count"),
    )
    op.create_index("ix_sms_rate_buckets_expires_at", "sms_rate_buckets", ["expires_at"])
    check_foreign_keys()


def downgrade():
    sqlite_guard()
    if (
        op.get_bind()
        .execute(
            sa.text("SELECT 1 FROM users WHERE email IS NULL OR password_hash IS NULL LIMIT 1")
        )
        .first()
    ):
        raise RuntimeError(
            "Phone-only accounts exist; refusing lossy downgrade. "
            "Restore an approved backup or migrate identities first"
        )
    with op.batch_alter_table("users") as batch:
        batch.alter_column("email", existing_type=sa.String(255), nullable=False)
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
    op.drop_table("sms_rate_buckets")
    op.drop_table("sms_challenges")
    op.drop_table("phone_identities")
    check_foreign_keys()
