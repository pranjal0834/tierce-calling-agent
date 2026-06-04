"""drop stripe columns from workspaces

Revision ID: 002
Revises: 001
Create Date: 2026-06-04

Stripe was removed as a payment provider — Razorpay (INR) is now the only
option. This drops the now-unused stripe_customer_id / stripe_subscription_id
columns from the workspaces table.
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_customer_id")
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_subscription_id")


def downgrade() -> None:
    op.execute("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)")
    op.execute("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)")
