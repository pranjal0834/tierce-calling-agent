"use client";
import { ReactNode } from "react";
import {
  Rocket, Zap, Bot, AudioLines, PhoneCall, MessageSquare, Wrench, BookOpen,
  CalendarCheck, PhoneForwarded, MessageCircle, Hash, PhoneIncoming, PhoneOutgoing,
  CalendarClock, ShieldCheck, CreditCard, Wallet, KeyRound, Phone, Webhook,
  AlertCircle, HelpCircle, Sparkles, Brain, Database,
} from "lucide-react";
import {
  H2, H3, P, Lead, Ul, Ol, Li, OLi, B, Code, CodeBlock, Table, Callout, Endpoint,
  Card, CardGroup, Steps, Step, Properties, Property, Badge, Divider,
} from "./_ui";

export interface DocPage { slug: string; title: string; icon: any; body: ReactNode }
export interface DocSection { section: string; pages: DocPage[] }

const BASE = "https://your-domain.com";

export const DOCS: DocSection[] = [
  {
    section: "Getting Started",
    pages: [
      {
        slug: "introduction",
        title: "Introduction",
        icon: Sparkles,
        body: (
          <>
            <Lead>Vaaniq Voice is an India-first AI voice-calling platform. Build AI phone agents that hold natural conversations in English and Indian regional languages, then put them to work on real phone numbers — answering inbound calls and running outbound campaigns at scale.</Lead>

            <P>Each agent can do real work over a phone call: check live calendar availability and book appointments, look up your knowledge base, transfer to a human, schedule callbacks, and send WhatsApp confirmations — all while sounding human.</P>

            <CardGroup>
              <Card icon={Rocket} title="Quickstart" href="/docs/quickstart">From sign-up to your first live call in five steps.</Card>
              <Card icon={Bot} title="Build an agent" href="/docs/agents">Persona, voice, language, and tools — the agent is the brain of every call.</Card>
              <Card icon={Phone} title="Telephony" href="/docs/phone-numbers">Buy a number, take inbound calls, and run outbound campaigns.</Card>
              <Card icon={KeyRound} title="API reference" href="/docs/api-authentication">Trigger calls and read results from your own apps.</Card>
            </CardGroup>

            <H2>What makes it different</H2>
            <Ul>
              <Li><B>Native-audio AI</B> — the model hears and speaks audio directly, so conversations are fast, natural, and interruptible (no robotic speech-to-text → LLM → text-to-speech chain).</Li>
              <Li><B>Regional languages</B> — first-class Hindi, Gujarati and more, with English mixed in the way people actually speak.</Li>
              <Li><B>Does real work</B> — books appointments on real calendars, transfers to humans, and pushes results to your systems via webhooks.</Li>
              <Li><B>Built for India</B> — TRAI/DLT-aware compliance, Razorpay billing, KYC for numbers, GST-aware costing.</Li>
            </Ul>

            <H2>How a call flows</H2>
            <Steps>
              <Step title="Connect">A call is placed (outbound) or received (inbound). Audio streams in real time to the platform.</Step>
              <Step title="Converse">The agent greets, listens, speaks, and handles interruptions naturally.</Step>
              <Step title="Act">When relevant it calls tools — check availability, book, transfer, look up knowledge.</Step>
              <Step title="Wrap up">After hangup: transcription, summary, sentiment, scoring, booking + emails, webhooks, and billing all run automatically.</Step>
            </Steps>

            <Callout type="tip">Brand new? The <a href="/docs/quickstart">Quickstart</a> gets you to a live call in about five minutes.</Callout>
          </>
        ),
      },
      {
        slug: "quickstart",
        title: "Quickstart",
        icon: Rocket,
        body: (
          <>
            <Lead>Go from a fresh account to a live AI phone call in five steps.</Lead>
            <Steps>
              <Step title="Create your account">
                <P>Register a workspace. You start on the <B>Free</B> plan with <B>20 trial minutes</B> — enough to test outbound calls immediately. No card required.</P>
              </Step>
              <Step title="Build an agent">
                <P>Go to <B>Agents → New Agent</B>. Set a name, language, and voice, then write a short system prompt describing who the agent is and what it should achieve. See <a href="/docs/system-prompt">System Prompt</a> for a proven structure, or start from a <B>Template</B>.</P>
              </Step>
              <Step title="Make a test outbound call">
                <P>On the <B>Calls</B> page click <B>Dial</B>, choose your agent, and enter a phone number. The agent calls and starts the conversation. (Free plan is outbound-only.)</P>
              </Step>
              <Step title="Get a phone number">
                <P>Upgrade to any paid plan, then buy a dedicated number (₹300/month) on the <B>Phone Numbers</B> page. This unlocks <B>inbound</B> calls and becomes your outbound caller ID.</P>
              </Step>
              <Step title="Go live & integrate">
                <P>Share the number for inbound, point campaigns at it for outbound, or trigger calls from your own apps via the <a href="/docs/api-authentication">API</a>.</P>
              </Step>
            </Steps>
            <Callout type="info">Each step maps to a section in this guide — follow the links to go deeper on any of them.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Core Concepts",
    pages: [
      {
        slug: "agents",
        title: "Agents",
        icon: Bot,
        body: (
          <>
            <Lead>An agent is a configured AI persona that handles calls. Everything about how a call sounds and behaves comes from the agent.</Lead>
            <H2>Anatomy of an agent</H2>
            <Table
              head={["Setting", "Controls"]}
              rows={[
                [<Code>System prompt</Code>, "The persona, goal, and rules — the agent's brain."],
                [<Code>Language</Code>, "Primary spoken language (drives transcription + voice)."],
                [<Code>Voice</Code>, "The synthesized voice the caller hears."],
                [<Code>AI engine</Code>, "Gemini (default) or OpenAI realtime."],
                [<Code>Tools</Code>, "Calendar booking, transfer, end call, callback, webhooks."],
                [<Code>Knowledge base</Code>, "Documents the agent can look up mid-call."],
                [<Code>Max duration</Code>, "Hard cap on call length."],
                [<Code>Backchannel</Code>, "Natural 'mhm/right' acknowledgements while the caller talks."],
              ]}
            />
            <H2>One workspace, many agents</H2>
            <P>Run as many agents as you need — a sales agent, a support agent, a survey agent. A purchased phone number is a <B>workspace line</B> shared by all of them: inbound calls route to the agent assigned to the number, and every agent dials out using the workspace number as caller ID.</P>
            <H2>Templates</H2>
            <P>Templates are pre-built agents (prompt + tools + voice) for common use cases. Start from one on the <B>Templates</B> page and customize it — faster than starting from a blank prompt.</P>
            <Callout type="tip">Keep one agent focused on one job. A tightly-scoped agent outperforms a do-everything agent on a phone call.</Callout>
          </>
        ),
      },
      {
        slug: "engines",
        title: "AI Engines & Voices",
        icon: AudioLines,
        body: (
          <>
            <Lead>Vaaniq runs on native-audio models — the AI hears and speaks audio directly, making conversations fast, natural, and interruptible.</Lead>
            <H2>Choosing an engine</H2>
            <Table
              head={["Engine", "Best for", "Trade-off"]}
              rows={[
                [<B>Gemini</B>, "Hindi / Gujarati / regional languages; lowest cost (default)", "Occasionally less precise at firing tools mid-call — the platform compensates with a post-call safety net."],
                [<B>OpenAI realtime</B>, "Strong English; very reliable in-call tool use", "~2–2.5× the AI cost; less natural on some regional languages."],
              ]}
            />
            <P>Set the engine per agent in the agent form. New agents default to <B>Gemini</B> for cost and language quality.</P>
            <H2>Languages</H2>
            <P>Set the agent's primary language so caller speech is transcribed correctly. The agent can still mix in English words naturally. Supported primary languages include:</P>
            <Ul>
              <Li>Hindi, Gujarati, Marathi, Punjabi, Bengali</Li>
              <Li>Tamil, Telugu, Kannada, Malayalam</Li>
              <Li>English (and English-mixed regional speech)</Li>
            </Ul>
            <H2>Voices & pacing</H2>
            <P>Pick a voice that matches the persona. You can also tune speaking pace and enable backchannel acknowledgements so the agent feels attentive while the caller speaks.</P>
            <Callout type="note">Caller speech is transcribed with a language hint so regional speech isn't mislabeled; the agent's own speech is transcribed natively for accuracy.</Callout>
          </>
        ),
      },
      {
        slug: "how-calls-work",
        title: "How a call works",
        icon: PhoneCall,
        body: (
          <>
            <Lead>Understanding the call lifecycle helps you design better agents and debug faster.</Lead>
            <H2>Lifecycle</H2>
            <Steps>
              <Step title="Connect">Telephony streams audio to the platform over a WebSocket as soon as the call is answered.</Step>
              <Step title="Greeting">The agent speaks first so there's no dead air while it waits for the caller.</Step>
              <Step title="Turn-taking">Voice activity detection decides when the caller starts and stops; the agent replies. Callers can interrupt (barge-in) any time and the agent stops to listen.</Step>
              <Step title="Tools">When relevant, the agent calls a tool (check availability, book, transfer) and weaves the result into the conversation.</Step>
              <Step title="Hangup">Either party ends the call; the platform records the real duration from the carrier (matches the phone).</Step>
              <Step title="Post-call">Transcription, summary, sentiment, evaluation, memory extraction, appointment booking + confirmation emails, webhooks, and credit deduction all run automatically.</Step>
            </Steps>
            <H2>Memory across calls</H2>
            <P>The platform builds a per-contact memory graph from past calls — name, preferences, interests, past outcomes — and injects it as background context on the next call, so repeat callers feel recognized.</P>
            <Callout type="warning">Memory is background context only: agents are instructed to always check live data (like calendar availability) with their tools rather than relying on what a past call mentioned.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Building Agents",
    pages: [
      {
        slug: "system-prompt",
        title: "System Prompt",
        icon: MessageSquare,
        body: (
          <>
            <Lead>The system prompt is the agent's brain. Keep it clear and concise — long, contradictory prompts make voice models behave erratically.</Lead>
            <H2>A reliable structure</H2>
            <Steps>
              <Step title="Identity">Who the agent is and which company it represents.</Step>
              <Step title="Goal">The single outcome of the call — book a demo, qualify a lead, confirm an order.</Step>
              <Step title="Style">Short sentences, warm tone, and the language to speak.</Step>
              <Step title="Branches">What to do for the common paths: interested / busy / not interested.</Step>
            </Steps>
            <CodeBlock lang="text" title="Example prompt" code={`You are Aarya, a friendly counselor calling on behalf of Arya Overseas.
Goal: check if the caller is interested in studying in Germany and, if so,
book a free consultation.

Speak in simple Hindi, one or two short sentences at a time, then pause.
- If interested: collect their preferred date and book an appointment.
- If busy: ask when to call back.
- If not interested: thank them politely and end the call.`} />
            <H2>Prompting tips</H2>
            <Ul>
              <Li><B>Be positive and short.</B> Tell the agent what to do, not a long list of "NEVER do X".</Li>
              <Li><B>One ask at a time.</B> On a call, people answer one question — don't stack three.</Li>
              <Li><B>Name the language explicitly</B> and allow natural English mixing.</Li>
              <Li><B>For bookings, instruct it to collect the caller's email</B> so the confirmation can be sent.</Li>
            </Ul>
            <Callout type="warning">Repeating a tool name many times (e.g. over-explaining when NOT to use it) can prime the model to call the wrong tool. Keep tool guidance minimal and clear.</Callout>
            <H2>Self-improvement</H2>
            <P>The platform evaluates every call and periodically distills <B>learned guidance</B> from real conversations, refining the agent automatically over time. You'll see the guidance update on the agent without changing your base prompt.</P>
          </>
        ),
      },
      {
        slug: "tools",
        title: "Tools",
        icon: Wrench,
        body: (
          <>
            <Lead>Tools let an agent do things during a call, not just talk. Add and configure them in the agent.</Lead>
            <H2>Available tools</H2>
            <Table
              head={["Tool", "What it does", "Key config"]}
              rows={[
                [<Code>calendar_booking</Code>, "Check availability and book appointments", "Provider + credentials"],
                [<Code>transfer_call</Code>, "Hand the live call to a human", "Destination number"],
                [<Code>schedule_callback</Code>, "Arrange a callback at a stated time", "—"],
                [<Code>end_call</Code>, "End the call cleanly when done", "—"],
                [<Code>webhook</Code>, "Call your HTTP endpoint mid-call", "URL + headers"],
                [<Code>query_knowledge_base</Code>, "Look up your documents (RAG)", "Linked KB"],
                [<Code>send_whatsapp</Code>, "Send a WhatsApp message (paid add-on)", "Workspace WhatsApp"],
              ]}
            />
            <Callout type="info">A single <Code>calendar_booking</Code> tool handles both checking availability and booking via an <Code>action</Code> argument — you don't need two separate tools.</Callout>
            <H2>How the agent decides</H2>
            <P>The agent calls a tool when the conversation calls for it — e.g. it uses <Code>calendar_booking</Code> when the caller wants an appointment. Describe in your prompt <B>when</B> each tool should be used so the model picks the right one.</P>
          </>
        ),
      },
      {
        slug: "knowledge-base",
        title: "Knowledge Base",
        icon: BookOpen,
        body: (
          <>
            <Lead>Give an agent a knowledge base so it answers questions about your products, pricing, and policies accurately instead of guessing.</Lead>
            <H2>Adding content</H2>
            <Steps>
              <Step title="Create a knowledge base">On the Knowledge Base page, create a KB and add documents.</Step>
              <Step title="Upload or crawl">Upload PDFs / text, or paste a URL — a URL is crawled across multiple pages automatically.</Step>
              <Step title="Indexing">Documents are split into chunks and embedded for semantic search. Large docs are processed in the background.</Step>
              <Step title="Attach to an agent">Link the KB in the agent's config so it can search it mid-call.</Step>
            </Steps>
            <H2>How retrieval works</H2>
            <P>When a caller asks a question, the agent retrieves the most relevant chunks (RAG — retrieval-augmented generation) and answers from them, so responses stay grounded in your real content.</P>
            <Callout type="warning">An agent only searches knowledge bases it's explicitly linked to. If answers seem generic, check that the KB is attached to that agent.</Callout>
          </>
        ),
      },
      {
        slug: "calendar-booking",
        title: "Calendar Booking",
        icon: CalendarCheck,
        body: (
          <>
            <Lead>Agents check real calendar availability and book appointments live, then send the caller a confirmation with a calendar invite.</Lead>
            <H2>Supported providers</H2>
            <Table
              head={["Provider", "How to connect"]}
              rows={[
                [<B>Google Calendar</B>, "OAuth — books on your business calendar."],
                [<B>Cal.com</B>, "API key + event type."],
                [<B>Calendly</B>, "API key + event type / scheduling link."],
              ]}
            />
            <H2>The booking flow</H2>
            <Steps>
              <Step title="Check availability">The agent fetches real open slots for the caller's date and offers only those (never invented times).</Step>
              <Step title="Collect email">It asks for and reads back the caller's email to confirm the spelling.</Step>
              <Step title="Book">It books the slot on your calendar.</Step>
              <Step title="Confirm">The caller gets one branded confirmation email with an attached calendar event (add-to-calendar + reminder built in).</Step>
            </Steps>
            <Callout type="tip">A post-call safety net books the agreed slot and sends the email even if the model only talked about booking — so confirmations are reliable.</Callout>
            <Callout type="info">Email is always the default channel. WhatsApp confirmation is a paid add-on that only fires when your workspace has connected WhatsApp.</Callout>
          </>
        ),
      },
      {
        slug: "call-transfer",
        title: "Call Transfer",
        icon: PhoneForwarded,
        body: (
          <>
            <Lead>When a caller needs a human, the agent transfers the live call to a number you configure.</Lead>
            <H2>How it works</H2>
            <Ul>
              <Li>Add the <Code>transfer_call</Code> tool to the agent with a destination number.</Li>
              <Li>Describe in the prompt when to transfer (e.g. "if the caller asks for a senior advisor").</Li>
              <Li>The agent dials the human and connects the caller.</Li>
              <Li>The post-transfer conversation is still transcribed and attached to the same call record; extra minutes are billed once.</Li>
            </Ul>
            <Callout type="warning">Use a real, answerable transfer number. A placeholder will connect and immediately drop.</Callout>
          </>
        ),
      },
      {
        slug: "whatsapp",
        title: "WhatsApp",
        icon: MessageCircle,
        body: (
          <>
            <Lead>WhatsApp messaging is an optional paid add-on. When enabled, agents can message the caller's own WhatsApp after a call.</Lead>
            <H2>Setup</H2>
            <Ul>
              <Li>Connect your own WhatsApp number / API key to the workspace.</Li>
              <Li>Messages send from <B>your</B> number using approved templates (appointment confirmation, info message).</Li>
              <Li>Enable WhatsApp on the agent so it can use <Code>send_whatsapp</Code> and send booking confirmations over WhatsApp.</Li>
            </Ul>
            <Callout type="info">Without the add-on, appointment confirmations still go out by email — WhatsApp simply isn't sent, and no caller is messaged from any other number.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Telephony",
    pages: [
      {
        slug: "phone-numbers",
        title: "Phone Numbers",
        icon: Hash,
        body: (
          <>
            <Lead>A phone number is a workspace line — one number serves both inbound and outbound for every agent in the workspace.</Lead>
            <H2>Buying a number</H2>
            <Steps>
              <Step title="Be on a paid plan">Free plan can't buy numbers. Pay-as-you-go and packs can.</Step>
              <Step title="Complete KYC (India)">Indian numbers require KYC by regulation. Submit once — most approvals are quick.</Step>
              <Step title="Purchase">Buy on the Phone Numbers page. The first month is charged via Razorpay.</Step>
              <Step title="Assign an agent">Pick which agent answers inbound calls to this number (or use the workspace default).</Step>
            </Steps>
            <H2>Rental & renewal</H2>
            <Table
              head={["Item", "Detail"]}
              rows={[
                ["Price", "Flat ₹300 / month per number"],
                ["Billed from", "Number Wallet (separate from call minutes)"],
                ["Renewal", "Auto-drawn from the wallet each cycle"],
                ["If unfunded", "Number is suspended until you renew"],
              ]}
            />
            <Callout type="warning">A suspended number can't receive or make calls until renewed. Keep your Number Wallet funded — you'll get reminders before each renewal.</Callout>
          </>
        ),
      },
      {
        slug: "inbound",
        title: "Inbound Calls",
        icon: PhoneIncoming,
        body: (
          <>
            <Lead>When someone dials your purchased number, the assigned agent answers automatically.</Lead>
            <H2>Routing</H2>
            <Ul>
              <Li>Each number has an assigned agent; if none, the workspace's first active agent answers.</Li>
              <Li>Inbound requires a <B>paid plan</B>, an active (non-suspended) number, and available call credits.</Li>
              <Li>If credits are exhausted, the caller hears a short "please top up" message instead of connecting.</Li>
            </Ul>
            <Callout type="info">Free-plan workspaces can't receive inbound — it's a paid feature tied to owning a number.</Callout>
          </>
        ),
      },
      {
        slug: "outbound-bulk",
        title: "Outbound & Bulk Calling",
        icon: PhoneOutgoing,
        body: (
          <>
            <Lead>Call one contact or thousands. Outbound uses your workspace number as caller ID.</Lead>
            <H2>Single call</H2>
            <P>On the <B>Calls</B> page click <B>Dial</B>, pick an agent, and enter a number.</P>
            <H2>Bulk campaign</H2>
            <Steps>
              <Step title="Upload contacts">Click Bulk Call and upload a CSV/Excel (or paste numbers). Name, company, and email columns are auto-detected.</Step>
              <Step title="Configure">Pick the agent and a calls-per-second rate. Start low (1/sec) and ramp up.</Step>
              <Step title="Consent">Confirm the consent attestation — required to launch.</Step>
              <Step title="Launch">The platform scrubs your Do-Not-Call list, then dials at your chosen rate.</Step>
            </Steps>
            <Callout type="warning">Free plan is capped at 3 contacts per campaign. Always test with a couple of your own numbers first — these are real, billed calls. The campaign stops automatically if you run out of credits mid-run.</Callout>
          </>
        ),
      },
      {
        slug: "scheduling",
        title: "Scheduling & Callbacks",
        icon: CalendarClock,
        body: (
          <>
            <Lead>Schedule calls for a future time instead of dialing now.</Lead>
            <Ul>
              <Li><B>Scheduled calls</B> — queue contacts (single or bulk) to be dialed at a chosen time on the Scheduling page. The scheduler dials them automatically when due, respecting your calling window.</Li>
              <Li><B>Callbacks</B> — during a call, the agent uses <Code>schedule_callback</Code> when a caller asks to be phoned back at a stated time.</Li>
            </Ul>
            <Callout type="info">Callbacks only trigger when the caller explicitly states a time — the agent won't invent or default one.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Compliance",
    pages: [
      {
        slug: "compliance",
        title: "Compliance",
        icon: ShieldCheck,
        body: (
          <>
            <Lead>Outbound calling is regulated. Vaaniq builds in guardrails so your campaigns stay compliant.</Lead>
            <H2>Built-in controls</H2>
            <Table
              head={["Control", "What it does"]}
              rows={[
                [<B>Consent attestation</B>, "You must confirm you hold consent before launching any campaign."],
                [<B>DNC list</B>, "Numbers on your Do-Not-Call list are skipped automatically; callers who opt out are added."],
                [<B>Calling window</B>, "Optionally block outbound dialing outside allowed hours (quiet hours), per timezone."],
                [<B>Opt-out guard</B>, "Campaigns pause automatically if your opt-out rate exceeds a safe threshold."],
              ]}
            />
            <H2>Your responsibilities</H2>
            <Ul>
              <Li>Have a lawful basis (consent or existing relationship) to call your contacts.</Li>
              <Li>Comply with TRAI/DLT and local telecom regulations.</Li>
              <Li>Honor opt-outs — the platform records them, but keep your own suppression lists clean too.</Li>
            </Ul>
            <Callout type="warning">Repeated abuse or high opt-out rates can get numbers flagged by carriers. Keep lists clean and messaging relevant.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Billing & Pricing",
    pages: [
      {
        slug: "pricing",
        title: "Plans & Pricing",
        icon: CreditCard,
        body: (
          <>
            <Lead>Two things are billed separately: call minutes (credits) and phone-number rental (number wallet).</Lead>
            <H2>Plans</H2>
            <Table
              head={["Plan", "Price", "Inbound", "Numbers", "Bulk"]}
              rows={[
                [<B>Free</B>, "20 trial minutes", "—", "—", "3 contacts"],
                [<B>Pay-as-you-go</B>, "₹10 / min", "✓", "✓", "higher"],
                [<B>Starter</B>, "₹999 → 105 min (~₹9.5/min)", "✓", "✓", "higher"],
                [<B>Growth</B>, "₹2,499 → 278 min (~₹9/min)", "✓", "✓", "higher"],
                [<B>Pro</B>, "₹4,999 → 588 min (~₹8.5/min)", "✓", "✓", "higher"],
                [<B>Scale</B>, "₹9,999 → 1,250 min (~₹8/min)", "✓", "✓", "higher"],
              ]}
            />
            <P>Packs get cheaper per minute the larger they are — up to ~20% off the Pay-as-you-go rate. Buying any paid plan unlocks inbound and number purchasing.</P>
            <H2>Phone numbers</H2>
            <P>Flat <B>₹300 / month per number</B>, paid from the Number Wallet (separate from call minutes).</P>
            <Callout type="info">Free-trial minutes are granted automatically on signup. When your balance hits zero, calling is blocked until you top up.</Callout>
          </>
        ),
      },
      {
        slug: "credits",
        title: "Credits & Number Wallet",
        icon: Wallet,
        body: (
          <>
            <Lead>Your workspace has two balances, topped up independently.</Lead>
            <Table
              head={["Wallet", "Pays for", "Top up"]}
              rows={[
                [<B>Call credits (minutes)</B>, "Inbound + outbound call time", "Buy a pack or Pay-as-you-go on the Billing page"],
                [<B>Number wallet (₹)</B>, "Monthly number rental + renewals", "Top up on the Phone Numbers page"],
              ]}
            />
            <H2>How billing works</H2>
            <Ul>
              <Li>Call minutes are deducted by the <B>real call duration</B> after each call.</Li>
              <Li>When credits reach zero, new inbound and outbound calls are blocked until you top up.</Li>
              <Li>Number renewals auto-draw the number wallet — fund it to avoid suspension.</Li>
              <Li>Payments are processed via <B>Razorpay</B> (UPI, cards, netbanking). India GST applies where relevant.</Li>
            </Ul>
            <Callout type="tip">Watch your balance pills in the dashboard sidebar — they warn you before credits or the number wallet run low.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Developers — API",
    pages: [
      {
        slug: "api-authentication",
        title: "Authentication",
        icon: KeyRound,
        body: (
          <>
            <Lead>The REST API lets you trigger calls and read results from your own apps.</Lead>
            <H2>Get an API key</H2>
            <P>Create a key on the <B>Developers</B> page. Pass it in the <Code>X-API-Key</Code> header on every request:</P>
            <CodeBlock lang="bash" title="Authenticated request" code={`curl ${BASE}/api/calls \\
  -H "X-API-Key: trc_your_key_here"`} />
            <P>All endpoints live under <Code>{BASE}/api</Code>. Requests and responses are JSON.</P>
            <Callout type="warning">Treat API keys like passwords — they carry your workspace's permissions. Never embed them in client-side code. Revoke a key any time from the Developers page.</Callout>
          </>
        ),
      },
      {
        slug: "api-calls",
        title: "Calls API",
        icon: Phone,
        body: (
          <>
            <Lead>Initiate single or bulk calls and read their results.</Lead>

            <H2>Initiate a call</H2>
            <Endpoint method="POST" path="/api/calls/initiate" />
            <Properties>
              <Property name="agent_id" type="string" required>The agent that will handle the call.</Property>
              <Property name="phone_number" type="string" required>Destination in E.164 format, e.g. +919812345678.</Property>
              <Property name="contact_data" type="object">Optional name / company / email to personalize the call and enrich the contact.</Property>
            </Properties>
            <CodeBlock lang="bash" title="cURL" code={`curl -X POST ${BASE}/api/calls/initiate \\
  -H "X-API-Key: trc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "your-agent-id",
    "phone_number": "+919812345678",
    "contact_data": { "name": "Riya", "company": "Acme" }
  }'`} />

            <H2>Bulk dial campaign</H2>
            <Endpoint method="POST" path="/api/calls/bulk" />
            <Properties>
              <Property name="agent_id" type="string" required>Agent for the campaign.</Property>
              <Property name="contacts" type="array" required>List of objects with phone_number (and optional name / company / email).</Property>
              <Property name="consent_attested" type="boolean" required>Must be true — confirms you hold consent to call this list.</Property>
              <Property name="calls_per_second" type="number">Dial rate. Defaults to 1.</Property>
            </Properties>
            <CodeBlock lang="bash" title="cURL" code={`curl -X POST ${BASE}/api/calls/bulk \\
  -H "X-API-Key: trc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "your-agent-id",
    "calls_per_second": 1,
    "consent_attested": true,
    "contacts": [
      { "phone_number": "+919812345678", "name": "Riya" },
      { "phone_number": "+919800000000", "name": "Aman" }
    ]
  }'`} />
            <P>DNC numbers are skipped automatically; the response reports how many were <Code>queued</Code> vs <Code>suppressed</Code>.</P>

            <H2>List calls & get detail</H2>
            <Endpoint method="GET" path="/api/calls" />
            <Endpoint method="GET" path="/api/calls/{id}/detail" />
            <P>List returns recent calls with status, duration, and outcome. The detail endpoint adds the full transcript, summary, sentiment, and any extracted appointment data.</P>
            <Callout type="info">A call returns immediately as <Code>queued/initiated</Code>. Use <a href="/docs/webhooks">webhooks</a> to be notified on completion instead of polling.</Callout>
          </>
        ),
      },
      {
        slug: "api-scheduling",
        title: "Scheduling & Agents API",
        icon: CalendarClock,
        body: (
          <>
            <Lead>Queue calls for the future and read agent data.</Lead>
            <H2>Schedule a call</H2>
            <Endpoint method="POST" path="/api/scheduling" />
            <CodeBlock lang="bash" title="cURL" code={`curl -X POST ${BASE}/api/scheduling \\
  -H "X-API-Key: trc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "your-agent-id",
    "phone_number": "+919812345678",
    "scheduled_at": "2026-07-01T10:00:00+05:30"
  }'`} />
            <H2>Bulk schedule</H2>
            <Endpoint method="POST" path="/api/scheduling/bulk" />
            <P>Queue many contacts to be dialed at a future time. The scheduler dials them when due, respecting your calling window.</P>
            <H2>Agents & analytics</H2>
            <Endpoint method="GET" path="/api/agents" />
            <Endpoint method="GET" path="/api/analytics/agent/{id}" />
            <P>List your agents, or pull per-agent analytics — call volume, outcomes, and evaluation scores.</P>
          </>
        ),
      },
      {
        slug: "webhooks",
        title: "Webhooks",
        icon: Webhook,
        body: (
          <>
            <Lead>Webhooks push call results to your server in real time. Configure endpoints on the Webhooks page.</Lead>
            <H2>Events</H2>
            <Table
              head={["Event", "Fires when"]}
              rows={[
                [<Code>call.completed</Code>, "A call finishes successfully."],
                [<Code>call.failed</Code>, "A call fails (no answer, busy, error)."],
              ]}
            />
            <H2>Payload</H2>
            <CodeBlock lang="json" title="call.completed" code={`{
  "event": "call.completed",
  "call_id": "…",
  "phone_number": "+919812345678",
  "direction": "outbound",
  "status": "completed",
  "duration_seconds": 142,
  "summary": "Caller booked a demo for Tuesday 3 PM.",
  "sentiment_score": 0.8,
  "agent_id": "…",
  "contact_id": "…",
  "created_at": "2026-06-30T10:00:00Z"
}`} />
            <Callout type="tip">Return a 2xx quickly; the platform retries failed deliveries. Need the full transcript? Call the call-detail endpoint with the <Code>call_id</Code>.</Callout>
          </>
        ),
      },
      {
        slug: "api-errors",
        title: "Errors & Limits",
        icon: AlertCircle,
        body: (
          <>
            <Lead>The API uses standard HTTP status codes; error bodies include a <Code>detail</Code> field.</Lead>
            <Table
              head={["Code", "Meaning"]}
              rows={[
                [<Badge tone="green">200 / 202</Badge>, "Success / accepted (async work queued)."],
                [<Badge tone="amber">400</Badge>, "Invalid request (e.g. missing consent on a campaign)."],
                [<Badge tone="amber">401</Badge>, "Missing or invalid API key."],
                [<Badge tone="amber">402</Badge>, "Insufficient call credits — top up to continue."],
                [<Badge tone="amber">403</Badge>, "Not allowed (number suspended, or free-plan limit)."],
                [<Badge tone="amber">404</Badge>, "Resource not found (agent, call)."],
                [<Badge tone="amber">429</Badge>, "Rate / safety limit (e.g. opt-out rate too high)."],
              ]}
            />
            <Callout type="info">Outbound and bulk calls need call credits &gt; 0 and an active (non-suspended) number. A 402 means you're out of minutes.</Callout>
          </>
        ),
      },
    ],
  },
  {
    section: "Resources",
    pages: [
      {
        slug: "faq",
        title: "FAQ",
        icon: HelpCircle,
        body: (
          <>
            <Lead>Quick answers to common questions.</Lead>
            <H3>Which languages are supported?</H3>
            <P>English plus Indian regional languages including Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada, Bengali and Punjabi. Gemini is the best engine for regional languages.</P>
            <H3>Why didn't the caller get an appointment email?</H3>
            <P>The agent must collect the caller's email. If it's missed, the event is still created but no email is sent. The post-call safety net books agreed appointments automatically when a concrete date and time are captured.</P>
            <H3>Why was my call blocked?</H3>
            <P>Usually you're out of call credits (top up), the plan doesn't allow the action (e.g. inbound on Free), or the number's rental lapsed (renew it).</P>
            <H3>Do inbound and outbound use the same number?</H3>
            <P>Yes — a purchased number is one workspace line used for both directions by all agents.</P>
            <H3>How is cost calculated?</H3>
            <P>Calls are billed by real duration against your minute credits. Number rental is a flat monthly charge from the number wallet.</P>
            <H3>Gemini or OpenAI — which should I use?</H3>
            <P>Gemini (default) for regional languages and lower cost; OpenAI realtime for the most reliable in-call tool use on English. See <a href="/docs/engines">AI Engines</a>.</P>
            <Callout type="tip">Still stuck? Contact support with the <B>call ID</B> — it ties to the full transcript and cost breakdown.</Callout>
          </>
        ),
      },
    ],
  },
];

export const FLAT_PAGES: { slug: string; title: string; section: string; icon: any }[] =
  DOCS.flatMap((s) => s.pages.map((p) => ({ slug: p.slug, title: p.title, section: s.section, icon: p.icon })));

export function findPage(slug?: string): DocPage {
  const target = slug || DOCS[0].pages[0].slug;
  for (const s of DOCS) for (const p of s.pages) if (p.slug === target) return p;
  return DOCS[0].pages[0];
}

export function neighbors(slug: string) {
  const idx = FLAT_PAGES.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? FLAT_PAGES[idx - 1] : null,
    next: idx >= 0 && idx < FLAT_PAGES.length - 1 ? FLAT_PAGES[idx + 1] : null,
  };
}
