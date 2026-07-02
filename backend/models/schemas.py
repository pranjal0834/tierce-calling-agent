from __future__ import annotations
from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr


# ─── Auth / Workspace ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    workspace_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WorkspaceOut(BaseModel):
    id: str
    name: str
    plan: str
    credits_balance: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: str
    workspace_id: str
    email: str
    role: str
    is_active: bool
    is_superadmin: bool = False
    has_password: bool = False
    needs_terms_acceptance: bool = False
    # Profile
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class ApiKeyCreate(BaseModel):
    name: str


class ApiKeyOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    last_used_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreated(BaseModel):
    """Returned once on creation — raw key is never stored."""
    id: str
    name: str
    key: str           # raw key shown ONCE
    created_at: datetime


# ─── Agent ─────────────────────────────────────────────────────────────────────

class AgentConfig(BaseModel):
    backchannel_enabled: bool = True
    emotional_intelligence: bool = True
    predictive_engine: bool = True
    memory_graph: bool = True
    pipeline_mode: str = "native"
    incremental_delay_ms: int = 400
    hangup_after_silence_s: int = 20
    max_call_duration_s: int = 3600
    backchannel_rate_limit_s: float = 12.0
    interruption_word_threshold: int = 3
    prediction_top_k: int = 3
    accent: str = ""
    speech_pace: str = "natural"
    languages: List[str] = Field(default_factory=lambda: ["English"])
    # Native-audio engine: "" (use system default), "openai" (gpt-realtime-mini),
    # or "gemini" (Gemini Live — better for Hindi/Gujarati/regional languages).
    engine: str = ""
    # Knowledge bases attached to this agent (for RAG via the query_knowledge_base tool).
    # Must be declared here or it gets stripped on save by this strict schema.
    knowledge_base_ids: List[str] = Field(default_factory=list)
    # Prompt variables: [{"name": "Agent Name", "value": "Pranjal"}, ...]. Used to replace
    # [Placeholder] tokens in the system prompt at call time ([Customer Name] = lead's name).
    variables: List[dict] = Field(default_factory=list)
    # WhatsApp (per-agent): when enabled, the agent sends `whatsapp_message` to the caller —
    # automatically after the call AND on request during it. Variables like [Customer Name]
    # are substituted at send time. Requires the workspace to have connected WhatsApp.
    # Must be declared here or it gets stripped on save by this strict schema.
    whatsapp_enabled: bool = False
    whatsapp_message: str = ""
    # Self-improvement output: coaching distilled from automated review of past calls,
    # written by PromptLearner and injected into every future call's system prompt. MUST be
    # declared here or it gets stripped whenever the agent is saved from the dashboard.
    learned_guidance: str = ""
    learned_guidance_updated_at: str = ""


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str
    pipeline_mode: str = "native"
    llm_model: str = "Tierce Voice Engine"
    voice_id: Optional[str] = None
    config: AgentConfig = Field(default_factory=AgentConfig)
    is_personal: bool = False


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    pipeline_mode: Optional[str] = None
    llm_model: Optional[str] = None
    voice_id: Optional[str] = None
    config: Optional[AgentConfig] = None


class AgentOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    system_prompt: str
    pipeline_mode: str
    llm_model: str
    voice_id: Optional[str]
    config: dict
    is_active: bool
    is_personal: bool = False
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Contact ───────────────────────────────────────────────────────────────────

class ContactCreate(BaseModel):
    phone_number: str
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    extra_data: dict = Field(default_factory=dict)


class ContactOut(BaseModel):
    id: str
    phone_number: str
    name: Optional[str]
    email: Optional[str]
    company: Optional[str]
    extra_data: dict
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Call ──────────────────────────────────────────────────────────────────────

class InitiateCallRequest(BaseModel):
    agent_id: str
    phone_number: str
    contact_data: Optional[dict] = None   # name, company, etc. for memory context


class BulkContactItem(BaseModel):
    phone_number: str
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None


class BulkCallRequest(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    agent_id: str
    contacts: list[BulkContactItem]
    calls_per_second: float = 1.0   # rate of initiating new calls (Twilio default limit)
    consent_attested: bool = False  # user confirmed they hold consent for this list


class BulkCallResponse(BaseModel):
    queued: int
    agent_id: str
    agent_name: str
    suppressed: int = 0   # contacts removed because they were on the DNC list


class CallOut(BaseModel):
    id: str
    agent_id: str
    contact_id: Optional[str]
    phone_number: str
    direction: str
    status: str
    duration_seconds: Optional[int]
    pipeline_mode: str
    summary: Optional[str]
    sentiment_score: Optional[float]
    emotion_profile: Optional[dict] = None
    extra_data: Optional[dict] = None
    cost_usd: Optional[float] = None
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Turn ──────────────────────────────────────────────────────────────────────

class TurnOut(BaseModel):
    id: str
    call_id: str
    turn_index: int
    role: str
    transcript: Optional[str]
    emotion_state: dict
    paralinguistic: dict
    sentiment: Optional[str]
    intent: Optional[str]
    latency_ms: Optional[int]
    eval_score: Optional[float]
    eval_feedback: Optional[str]
    from_prediction_cache: bool
    from_transfer: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Scheduling ────────────────────────────────────────────────────────────────

class ScheduleCallRequest(BaseModel):
    agent_id: str
    phone_number: str
    scheduled_at: datetime          # UTC ISO sent by frontend
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None
    timezone: str = "Asia/Kolkata"


class BulkScheduleRequest(BaseModel):
    agent_id: str
    scheduled_at: datetime
    contacts: list[BulkContactItem]
    timezone: str = "Asia/Kolkata"
    notes: Optional[str] = None


class ScheduledCallOut(BaseModel):
    id: str
    workspace_id: str
    agent_id: str
    phone_number: str
    contact_name: Optional[str]
    contact_email: Optional[str]
    scheduled_at: datetime
    timezone: str
    status: str
    call_id: Optional[str]
    error_message: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Memory ────────────────────────────────────────────────────────────────────

class MemoryNodeOut(BaseModel):
    id: str
    contact_id: str
    node_type: str
    label: str
    value: Optional[str]
    confidence: float
    source_call_id: Optional[str]
    extra_data: dict
    created_at: datetime

    class Config:
        from_attributes = True


class MemoryGraphOut(BaseModel):
    contact_id: str
    nodes: list[MemoryNodeOut]
    edges: list[dict]


# ─── Analytics ─────────────────────────────────────────────────────────────────

class AgentAnalytics(BaseModel):
    agent_id: str
    total_calls: int
    avg_duration_s: float
    avg_sentiment_score: float
    avg_eval_score: float
    cache_hit_rate: float
    emotion_distribution: dict
    calls_per_day: list[dict]
    fine_tuning_runs: int
    latest_model: Optional[str]


# ─── WebSocket Messages ────────────────────────────────────────────────────────

class WSIncomingMessage(BaseModel):
    event: str          # audio | text | mark | start | stop
    data: Optional[Any] = None
    meta: dict = Field(default_factory=dict)


class WSOutgoingMessage(BaseModel):
    event: str          # audio | text | emotion | backchannel | hangup
    data: Optional[Any] = None
    meta: dict = Field(default_factory=dict)


# ─── Fine-tuning ───────────────────────────────────────────────────────────────

class FineTuningRunOut(BaseModel):
    id: str
    agent_id: str
    openai_job_id: Optional[str]
    base_model: str
    fine_tuned_model: Optional[str]
    status: str
    training_samples: int
    eval_improvement: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True
