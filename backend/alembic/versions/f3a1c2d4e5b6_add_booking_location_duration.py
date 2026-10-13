"""add booking location and duration

Revision ID: f3a1c2d4e5b6
Revises: 5e0b2fd720d3
Create Date: 2026-10-13 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a1c2d4e5b6'
down_revision: Union[str, None] = '5e0b2fd720d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('bookings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('location', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('duration_hours', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('bookings', schema=None) as batch_op:
        batch_op.drop_column('duration_hours')
        batch_op.drop_column('location')
