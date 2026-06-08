# Tierce Voice Agent Platform

Next-generation AI voice calling SaaS — built to be better than Bolna AI, Ringg AI, and every other platform.

## What makes it different

Most voice AI platforms use this pipeline:
```
audio in → STT → LLM → TTS → audio out
```
This loses emotions, prosody, and context — and adds ~300–500ms of latency.

**Tierce goes further with 6 proprietary features:**

---

### 1. Native Audio Models
Skip STT + TTS entirely. Raw audio in → GPT-4o Realtime → raw audio out.
- Pipeline: `telephony → GPT-4o Realtime WebSocket → telephony`
- Latency drops ~300ms vs STT→LLM→TTS pipeline
- Voice emotions and prosody preserved natively

### 2. Emotional Intelligence Layer
Three parallel streams from every user utterance:
- **Paralinguistic analysis** — pitch, energy, speaking rate, pauses (via librosa)
- **Transcript analysis** — what they said
- **Sentiment + intent** — frustrated / excited / confused / interested (via LLM)

All three fused → adaptive system prompt injection every turn.
High pitch + fast rate = excited → agent responds with matching energy.
Long pauses = confused → agent slows down and clarifies.

### 3. Self-Improving Feedback Loop
```
Live calls → auto-evaluation (LLM grades 1-10) → failure mining
→ fine-tuning on corrected examples → better model → live calls
```
Every 1,000 calls = new fine-tuning run = compounding quality.
At 100,000 calls, no competitor can replicate your model's quality.

### 4. Predictive Conversation Engine
After each agent response, pre-generates responses for the top-3 most likely user replies.
When user speaks → cache lookup → ~60% cache hit rate on predictable flows.
TTFT ≈ 0ms for those turns. No other platform does this.

### 5. Deep Memory Graph
Every contact has a persistent knowledge graph across ALL calls:
- Name, company, role, preferences, past issues, purchase history
- Graph nodes connected by relationships (has_preference, reported_issue, etc.)
- Context injected into system prompt at call start

Hyper-personalized from the first sentence instead of "Hi, how can I help?"

### 6. Backchannel Engine
Pre-recorded short fillers played while user speaks:
- "mm-hmm", "uh-huh", "I see", "right", "yes", "okay"
- Rate-limited (max 1 per 12 seconds)
- Rotated to avoid repetition
- Result: sounds human, not robotic

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | Python 3.12 + FastAPI + WebSockets  |
| Database    | PostgreSQL 16 (SQLAlchemy async)    |
| Cache       | Redis 7                             |
| Native LLM  | OpenAI GPT-4o Realtime API          |
| Classic LLM | OpenAI GPT-4o / fine-tuned models   |
| STT         | N/A (native audio bypasses STT)     |
| TTS         | N/A (native audio bypasses TTS)     |
| Emotion     | librosa (local) or Hume AI API      |
| Telephony   | Twilio / Plivo                      |
| Frontend    | Next.js 15 + Tailwind CSS           |
| Deployment  | Docker Compose + ngrok (dev)        |

---

## Getting Started

### 1. Clone & configure
```bash
cp .env.sample .env
# Fill in OPENAI_API_KEY and TWILIO_* credentials
```

### 2. Start with Docker
```bash
docker-compose up --build
```

### 3. Open the dashboard
```
http://localhost:3000
```

### 4. Create your first agent
- Go to **Agents** → **New Agent**
- Set pipeline mode: **Native Audio** (recommended)
- Enable all 6 features
- Save

### 5. Make a call
- Go to **Calls** → **Dial**
- Select your agent, enter a phone number
- Click **Call**

---

## Project Structure

```
tierce-voice/
├── backend/
│   ├── api/                      # FastAPI REST routes
│   ├── core/                     # Pipeline orchestration
│   │   ├── task_manager.py       # Call session coordinator
│   │   ├── interruption_manager.py
│   │   └── assistant_manager.py
│   ├── features/
│   │   ├── native_audio/         # Feature 1: GPT-4o Realtime audio streaming
│   │   ├── emotional_intelligence/  # Feature 2: paralinguistic + sentiment + fusion
│   │   ├── feedback_loop/        # Feature 3: logger + evaluator + fine-tuner
│   │   ├── predictive_engine/    # Feature 4: speculation + cache
│   │   ├── memory_graph/         # Feature 5: extractor + retriever
│   │   └── backchannel/          # Feature 6: filler engine
│   ├── db/                       # SQLAlchemy models + sessions
│   ├── telephony/                # Twilio + Plivo handlers
│   └── main.py                   # FastAPI app entry point
├── frontend/
│   └── src/
│       ├── app/                  # Next.js App Router pages
│       └── components/           # Reusable UI components
├── docker-compose.yml
└── .env.sample
```

---

## Environment Variables

See [.env.sample](.env.sample) for all required variables.

**Required to start:**
- `OPENAI_API_KEY` — for native audio, LLM, evaluation, speculation, fine-tuning
- `TWILIO_*` or `PLIVO_*` — for making/receiving calls

**Optional:**
- `DEEPGRAM_API_KEY` — (not needed for native audio pipeline)
- `ELEVENLABS_API_KEY` — (not needed for native audio pipeline)
- `HUME_API_KEY` — for higher-quality emotion analysis (default: local librosa)

---

## Cost Model & Tracking (COGS)

Every call records its true OpenAI cost in `calls.cost_usd`, with a full per-component
split in `calls.extra_data.cost_breakdown`. Cost is **owner-only** — surfaced in the
super-admin panel (`/admin → Costs` rollup, and a per-call breakdown in the Calls tab);
it is never shown to tenants.

### Per-1M-token rates — `gpt-realtime-mini` (call audio)
Configured in `backend/config.py` (`REALTIME_*`):

| Bucket | Rate |
|--------|-----:|
| Audio input (uncached) | $10.00 |
| Audio input (cached context) | $0.30 |
| Audio output | $20.00 |
| Text input (uncached) | $0.60 |
| Text input (cached) | $0.06 |
| Text output | $2.40 |

> Full `gpt-realtime` (not used) is ~3.3× pricier: audio $32 in / $64 out.

### Auxiliary models (per call, tracked via `backend/core/cost_meter.py`)
| Component | Model | Rate (per 1M) | When |
|-----------|-------|---------------|------|
| Speculation predict | gpt-4.1-mini | $0.40 in / $1.60 out | per user turn |
| Speculation pre-generate | gpt-4o-mini | $0.15 in / $0.60 out | per user turn |
| Sentiment | gpt-4.1-mini | $0.40 / $1.60 | per turn (only if transcript passed) |
| Evaluation | gpt-4.1-mini | $0.40 / $1.60 | post-call, per agent turn |
| Memory extraction | gpt-4.1-mini | $0.40 / $1.60 | post-call |
| Summary extraction | gpt-4.1-mini | $0.40 / $1.60 | post-call |
| Backchannel TTS | tts-1 | $15 / 1M chars | call start (if not pre-cached) |
| KB query | text-embedding-3-small | $0.02 / 1M | per KB lookup |
| Transcription | whisper-1 | $0.006 / min of caller speech | during call |

`cost_usd` (grand total) = realtime audio/text + Whisper + all auxiliary. The breakdown
stores `realtime_usd`, `auxiliary_usd`, `grand_total_usd`, plus a per-component `auxiliary` map.

### ⚠️ The cached-audio gotcha (important)
In a multi-turn realtime call, each assistant turn re-processes the **entire prior
conversation** as input. OpenAI bills that repeated context as **cached tokens** at the
cached rate ($0.30/1M vs $10/1M for audio — 33× cheaper). The usage event reports the
split in `input_token_details.cached_tokens_details` (`audio_tokens` / `text_tokens`).

**Cached audio MUST be billed at the cached rate**, not the full rate. Counting all audio
input at $10/1M overstated cost by ~73% (e.g. a call billed ~$0.29 vs OpenAI's actual ~$0.13).
See `_persist_cost` in `backend/features/native_audio/openai_realtime.py`.

### Pricing & USD→INR
- Pack prices are set in ₹ directly (`backend/billing/credits.py` `PACKS_INR`); selling
  price works out to **₹8–10 / ~$0.10–0.12 per minute**.
- Typical COGS ≈ **$0.02–0.03 / min** → **~75% gross margin**.
- `USD_TO_INR` is env-configurable (`.env`, default 95.61) — used for number-rental
  pricing and the admin revenue/margin calc. Update it when the rate moves materially.

---

## API Reference

| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/agents`                     | Create agent             |
| GET    | `/api/agents`                     | List agents              |
| POST   | `/api/calls/initiate`             | Start outbound call      |
| GET    | `/api/calls/{id}/turns`           | Get call transcript      |
| GET    | `/api/analytics/agent/{id}`       | Agent performance stats  |
| GET    | `/api/memory/contacts/{id}/graph` | Contact memory graph     |
| WS     | `/ws/call/{agent_id}`             | Telephony audio stream   |

---

Built by Tierce | director@tierceindia.com
