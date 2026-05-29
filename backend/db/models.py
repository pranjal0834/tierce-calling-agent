import uuid
from datetime import datetime
from sqlalchemy import (
    String, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from backend.db.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ─── Workspace ─────────────────────────────────────────────────────────────────

class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    credits_balance: Mapped[float] = mapped_column(Float, default=0.0)   # call minutes remaining
    number_balance_inr: Mapped[float] = mapped_column(Float, default=0.0)  # number rental wallet (INR)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100))
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship("User", back_populates="workspace")
    agents: Mapped[list["Agent"]] = relationship("Agent", back_populates="workspace")
    contacts: Mapped[list["Contact"]] = relationship("Contact", back_populates="workspace")


# ─── User ──────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255))   # None for OAuth-only
    google_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    role: Mapped[str] = mapped_column(String(20), default="member")    # owner | member
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="users")

    __table_args__ = (Index("idx_users_email", "email"),)


# ─── Notification Preferences ──────────────────────────────────────────────────

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    welcome_email: Mapped[bool] = mapped_column(Boolean, default=True)
    announcement_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    low_credits_alert: Mapped[bool] = mapped_column(Boolean, default=True)
    call_summary_emails: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", backref="notification_prefs")


# ─── API Keys ──────────────────────────────────────────────────────────────────

class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # SHA-256 hex
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace")


# ─── Telephony Config ──────────────────────────────────────────────────────────

class TelephonyConfig(Base):
    __tablename__ = "telephony_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), default="twilio")   # twilio | exotel
    config: Mapped[dict] = mapped_column(JSONB, default=dict)             # provider credentials
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─── Phone Numbers ─────────────────────────────────────────────────────────────

class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    twilio_sid: Mapped[str] = mapped_column(String(50), nullable=False)
    friendly_name: Mapped[str | None] = mapped_column(String(255))
    capabilities: Mapped[dict] = mapped_column(JSONB, default=dict)
    provider: Mapped[str] = mapped_column(String(20), default="twilio")  # twilio | plivo
    monthly_cost_usd: Mapped[float] = mapped_column(Float, default=1.0)
    last_billed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "phone_number", name="uq_phone_numbers_workspace_phone"),
        Index("idx_phone_numbers_workspace", "workspace_id"),
        Index("idx_phone_numbers_phone", "phone_number"),
    )


# ─── Regulatory Bundles (KYC) ─────────────────────────────────────────────────

class RegulatoryBundle(Base):
    __tablename__ = "regulatory_bundles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False)          # ISO e.g. "IN"

    # Plivo-side IDs
    plivo_bundle_sid: Mapped[str | None] = mapped_column(String(100))
    plivo_end_user_id: Mapped[str | None] = mapped_column(String(100))
    plivo_address_id: Mapped[str | None] = mapped_column(String(100))

    # Status: pending | submitted | approved | rejected | failed
    status: Mapped[str] = mapped_column(String(20), default="pending")

    # Business info
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    business_type: Mapped[str] = mapped_column(String(20), default="company")  # company | individual
    gstin: Mapped[str | None] = mapped_column(String(20))
    cin: Mapped[str | None] = mapped_column(String(30))

    # Registered address
    address_line: Mapped[str] = mapped_column(String(300), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(10), nullable=False)

    # Authorized signatory
    authorized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    authorized_pan: Mapped[str | None] = mapped_column(String(10))

    error_message: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "country", name="uq_reg_bundle_workspace_country"),
        Index("idx_reg_bundles_workspace", "workspace_id"),
    )


# ─── Agents ────────────────────────────────────────────────────────────────────

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    pipeline_mode: Mapped[str] = mapped_column(String(20), default="native")  # native | classic
    llm_model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini-realtime-preview-2024-12-17")
    voice_id: Mapped[str | None] = mapped_column(String(100))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="agents")
    calls: Mapped[list["Call"]] = relationship("Call", back_populates="agent")

    __table_args__ = (Index("idx_agents_workspace_id", "workspace_id"),)


# ─── Contacts ──────────────────────────────────────────────────────────────────

class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="contacts")
    calls: Mapped[list["Call"]] = relationship("Call", back_populates="contact")
    memory_nodes: Mapped[list["MemoryNode"]] = relationship("MemoryNode", back_populates="contact")

    __table_args__ = (
        UniqueConstraint("workspace_id", "phone_number", name="uq_contacts_workspace_phone"),
        Index("idx_contacts_workspace_phone", "workspace_id", "phone_number"),
    )


# ─── Calls ─────────────────────────────────────────────────────────────────────

class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False)
    contact_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("contacts.id"))
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), default="outbound")  # inbound | outbound
    status: Mapped[str] = mapped_column(String(20), default="initiated")
    telephony_sid: Mapped[str | None] = mapped_column(String(100))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    pipeline_mode: Mapped[str] = mapped_column(String(20), default="native")
    summary: Mapped[str | None] = mapped_column(Text)
    sentiment_score: Mapped[float | None] = mapped_column(Float)
    emotion_profile: Mapped[dict] = mapped_column(JSONB, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    recording_url: Mapped[str | None] = mapped_column(Text)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace")
    agent: Mapped["Agent"] = relationship("Agent", back_populates="calls")
    contact: Mapped["Contact | None"] = relationship("Contact", back_populates="calls")
    turns: Mapped[list["CallTurn"]] = relationship("CallTurn", back_populates="call")

    __table_args__ = (
        Index("idx_calls_workspace_id", "workspace_id"),
        Index("idx_calls_agent_id", "agent_id"),
        Index("idx_calls_contact_id", "contact_id"),
        Index("idx_calls_created_at", "created_at"),
    )


# ─── Call Turns ────────────────────────────────────────────────────────────────

class CallTurn(Base):
    __tablename__ = "call_turns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    call_id: Mapped[str] = mapped_column(String(36), ForeignKey("calls.id"), nullable=False)
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)   # user | agent
    transcript: Mapped[str | None] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(500))
    emotion_state: Mapped[dict] = mapped_column(JSONB, default=dict)
    paralinguistic: Mapped[dict] = mapped_column(JSONB, default=dict)
    sentiment: Mapped[str | None] = mapped_column(String(50))
    intent: Mapped[str | None] = mapped_column(String(100))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    tokens_used: Mapped[int | None] = mapped_column(Integer)
    eval_score: Mapped[float | None] = mapped_column(Float)
    eval_feedback: Mapped[str | None] = mapped_column(Text)
    eval_categories: Mapped[dict] = mapped_column(JSONB, default=dict)
    from_prediction_cache: Mapped[bool] = mapped_column(Boolean, default=False)
    from_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    call: Mapped["Call"] = relationship("Call", back_populates="turns")

    __table_args__ = (Index("idx_turns_call_id", "call_id"),)


# ─── Scheduled Calls ───────────────────────────────────────────────────────────

class ScheduledCall(Base):
    __tablename__ = "scheduled_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(30), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # UTC
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|running|completed|failed|cancelled
    call_id: Mapped[str | None] = mapped_column(String(36))             # linked after firing
    error_message: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_scheduled_calls_workspace_id", "workspace_id"),
        Index("idx_scheduled_calls_status", "status"),
        Index("idx_scheduled_calls_scheduled_at", "scheduled_at"),
    )


# ─── Memory Graph ──────────────────────────────────────────────────────────────

class MemoryNode(Base):
    """A fact/entity about a contact stored across calls."""
    __tablename__ = "memory_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    contact_id: Mapped[str] = mapped_column(String(36), ForeignKey("contacts.id"), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)  # person|company|product|issue|preference|event
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source_call_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("calls.id"))
    embedding: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contact: Mapped["Contact"] = relationship("Contact", back_populates="memory_nodes")
    outgoing_edges: Mapped[list["MemoryEdge"]] = relationship("MemoryEdge", foreign_keys="MemoryEdge.from_node_id", back_populates="from_node")
    incoming_edges: Mapped[list["MemoryEdge"]] = relationship("MemoryEdge", foreign_keys="MemoryEdge.to_node_id", back_populates="to_node")

    __table_args__ = (Index("idx_memory_nodes_contact_id", "contact_id"),)


class MemoryEdge(Base):
    """Relationship between two memory nodes."""
    __tablename__ = "memory_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    from_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("memory_nodes.id"), nullable=False)
    to_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("memory_nodes.id"), nullable=False)
    relation: Mapped[str] = mapped_column(String(100), nullable=False)  # has_preference|reported_issue|purchased|mentioned
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    from_node: Mapped["MemoryNode"] = relationship("MemoryNode", foreign_keys=[from_node_id], back_populates="outgoing_edges")
    to_node: Mapped["MemoryNode"] = relationship("MemoryNode", foreign_keys=[to_node_id], back_populates="incoming_edges")


# ─── Fine-tuning Runs ──────────────────────────────────────────────────────────

class FineTuningRun(Base):
    __tablename__ = "fine_tuning_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False)
    openai_job_id: Mapped[str | None] = mapped_column(String(100))
    base_model: Mapped[str] = mapped_column(String(100))
    fine_tuned_model: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|running|succeeded|failed
    training_samples: Mapped[int] = mapped_column(Integer, default=0)
    calls_since_last_run: Mapped[int] = mapped_column(Integer, default=0)
    eval_improvement: Mapped[float | None] = mapped_column(Float)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─── Webhooks ──────────────────────────────────────────────────────────────────

class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    events: Mapped[list] = mapped_column(JSONB, default=list)   # ["call.completed", ...]
    secret: Mapped[str] = mapped_column(String(64), nullable=False)  # HMAC signing secret
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deliveries: Mapped[list["WebhookDelivery"]] = relationship("WebhookDelivery", back_populates="endpoint")

    __table_args__ = (Index("idx_webhook_endpoints_workspace_id", "workspace_id"),)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    endpoint_id: Mapped[str] = mapped_column(String(36), ForeignKey("webhook_endpoints.id"), nullable=False)
    workspace_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[str | None] = mapped_column(Text)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    endpoint: Mapped["WebhookEndpoint"] = relationship("WebhookEndpoint", back_populates="deliveries")

    __table_args__ = (
        Index("idx_webhook_deliveries_endpoint_id", "endpoint_id"),
        Index("idx_webhook_deliveries_workspace_id", "workspace_id"),
    )


# ─── Credit Transactions ───────────────────────────────────────────────────────

class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)      # purchase | deduction | free_trial
    minutes: Mapped[float] = mapped_column(Float, nullable=False)       # positive=add, negative=deduct
    balance_after: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    payment_provider: Mapped[str | None] = mapped_column(String(20))    # razorpay | stripe
    payment_id: Mapped[str | None] = mapped_column(String(100))
    call_id: Mapped[str | None] = mapped_column(String(36))
    pack_id: Mapped[str | None] = mapped_column(String(50))             # starter|growth|pro|scale
    amount_paid: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(3))             # INR | USD
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship("Workspace")

    __table_args__ = (
        Index("idx_credit_tx_workspace_id", "workspace_id"),
        Index("idx_credit_tx_created_at", "created_at"),
    )
