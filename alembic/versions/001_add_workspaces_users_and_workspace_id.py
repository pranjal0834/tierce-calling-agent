"""add workspaces users and workspace_id

Revision ID: 001
Revises:
Create Date: 2026-05-13

Migration strategy (safe for existing data):
  1. Create workspaces table + seed default workspace row
  2. Create users + api_keys tables
  3. Add workspace_id (nullable first) to all existing tables
  4. Backfill workspace_id = 'default' for all existing rows
  5. Make workspace_id NOT NULL
  6. Drop old global unique on contacts.phone_number
  7. Add composite unique (workspace_id, phone_number)
  8. Add workspace_id FK on fine_tuning_runs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. workspaces (IF NOT EXISTS) ──────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            plan VARCHAR(50) NOT NULL DEFAULT 'free',
            stripe_customer_id VARCHAR(100),
            stripe_subscription_id VARCHAR(100),
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)

    # Seed the default workspace (skip if already exists)
    op.execute(
        f"INSERT INTO workspaces (id, name, plan, created_at) "
        f"VALUES ('{DEFAULT_WORKSPACE_ID}', 'Default Workspace', 'free', now()) "
        f"ON CONFLICT (id) DO NOTHING"
    )

    # ── 2. users (IF NOT EXISTS) ───────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
            email VARCHAR(255) NOT NULL UNIQUE,
            hashed_password VARCHAR(255),
            google_id VARCHAR(100) UNIQUE,
            role VARCHAR(20) NOT NULL DEFAULT 'member',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)")

    # ── 3. api_keys (IF NOT EXISTS) ────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id VARCHAR(36) PRIMARY KEY,
            workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
            key_hash VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            last_used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)

    # ── 4a. workspace_id on agents ─────────────────────────────────────────────
    op.execute(f"""
        ALTER TABLE agents
            ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36)
    """)
    op.execute(f"UPDATE agents SET workspace_id = '{DEFAULT_WORKSPACE_ID}' WHERE workspace_id IS NULL")
    op.execute("ALTER TABLE agents ALTER COLUMN workspace_id SET NOT NULL")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE agents ADD CONSTRAINT fk_agents_workspace
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents (workspace_id)")

    # ── 4b. workspace_id on contacts ──────────────────────────────────────────
    op.execute(f"""
        ALTER TABLE contacts
            ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36)
    """)
    op.execute(f"UPDATE contacts SET workspace_id = '{DEFAULT_WORKSPACE_ID}' WHERE workspace_id IS NULL")
    op.execute("ALTER TABLE contacts ALTER COLUMN workspace_id SET NOT NULL")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE contacts ADD CONSTRAINT fk_contacts_workspace
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)

    # Drop old global unique on phone_number if it exists, add composite unique
    op.execute("""
        DO $$ BEGIN
            DROP INDEX IF EXISTS idx_contacts_phone;
            ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_number_key;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE contacts ADD CONSTRAINT uq_contacts_workspace_phone
                UNIQUE (workspace_id, phone_number);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_contacts_workspace_phone ON contacts (workspace_id, phone_number)")

    # ── 4c. workspace_id on calls ──────────────────────────────────────────────
    op.execute(f"""
        ALTER TABLE calls
            ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36)
    """)
    op.execute(f"UPDATE calls SET workspace_id = '{DEFAULT_WORKSPACE_ID}' WHERE workspace_id IS NULL")
    op.execute("ALTER TABLE calls ALTER COLUMN workspace_id SET NOT NULL")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE calls ADD CONSTRAINT fk_calls_workspace
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_calls_workspace_id ON calls (workspace_id)")

    # ── 4d. workspace_id on fine_tuning_runs ──────────────────────────────────
    op.execute(f"""
        ALTER TABLE fine_tuning_runs
            ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36)
    """)
    op.execute(f"UPDATE fine_tuning_runs SET workspace_id = '{DEFAULT_WORKSPACE_ID}' WHERE workspace_id IS NULL")
    op.execute("ALTER TABLE fine_tuning_runs ALTER COLUMN workspace_id SET NOT NULL")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE fine_tuning_runs ADD CONSTRAINT fk_fine_tuning_runs_workspace
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)


def downgrade() -> None:
    op.drop_constraint("fk_fine_tuning_runs_workspace", "fine_tuning_runs", type_="foreignkey")
    op.drop_column("fine_tuning_runs", "workspace_id")

    op.drop_index("idx_calls_workspace_id", table_name="calls")
    op.drop_constraint("fk_calls_workspace", "calls", type_="foreignkey")
    op.drop_column("calls", "workspace_id")

    op.drop_index("idx_contacts_workspace_phone", table_name="contacts")
    op.drop_constraint("uq_contacts_workspace_phone", "contacts", type_="unique")
    op.create_unique_constraint("contacts_phone_number_key", "contacts", ["phone_number"])
    op.create_index("idx_contacts_phone", "contacts", ["phone_number"])
    op.drop_constraint("fk_contacts_workspace", "contacts", type_="foreignkey")
    op.drop_column("contacts", "workspace_id")

    op.drop_index("idx_agents_workspace_id", table_name="agents")
    op.drop_constraint("fk_agents_workspace", "agents", type_="foreignkey")
    op.drop_column("agents", "workspace_id")

    op.drop_table("api_keys")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("workspaces")
