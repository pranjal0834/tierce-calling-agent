"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Webhook, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Copy, Check, ToggleLeft, ToggleRight,
  Globe, Zap, ArrowRight, Code2, ShieldCheck, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import {
  getWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  testWebhookEndpoint,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  secret?: string;
}

interface Delivery {
  id: string;
  event_type: string;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  delivered_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_EVENTS = [
  {
    key: "call.started",
    label: "Call Started",
    description: "Fires the moment a call connects to the recipient",
  },
  {
    key: "call.completed",
    label: "Call Completed",
    description: "Fires when a call ends normally — includes transcript & summary",
  },
  {
    key: "call.failed",
    label: "Call Failed",
    description: "Fires when a call could not be connected or errors mid-call",
  },
];

const EVENT_COLORS: Record<string, string> = {
  "call.started":   "bg-info-50 text-info-600 border-blue-200",
  "call.completed": "bg-success-50 text-success-600 border-green-200",
  "call.failed":    "bg-error-50 text-error-600 border-red-200",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  return new Date(utc).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function CopyBtn({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [done, setDone] = useState(false);
  const sz = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      className="text-neutral-400 hover:text-neutral-900 transition-colors p-1 rounded"
      title="Copy"
    >
      {done ? <Check className={`${sz} text-success-500`} /> : <Copy className={sz} />}
    </button>
  );
}

// ── Delivery row ───────────────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: Delivery }) {
  const [open, setOpen] = useState(false);
  const ok = d.response_status !== null && d.response_status >= 200 && d.response_status < 300;
  const pending = d.response_status === null;

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
      >
        {pending ? (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-mono shrink-0">
            <Clock className="w-3 h-3" /> Pending
          </span>
        ) : ok ? (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success-50 text-success-600 border border-green-200 font-mono shrink-0">
            <CheckCircle2 className="w-3 h-3" /> {d.response_status}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-error-50 text-error-600 border border-red-200 font-mono shrink-0">
            <XCircle className="w-3 h-3" /> {d.response_status}
          </span>
        )}

        <span className={`text-xs px-2 py-0.5 rounded-full border font-mono shrink-0 ${EVENT_COLORS[d.event_type] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
          {d.event_type}
        </span>

        <span className="flex-1 text-xs text-neutral-400">{fmtDate(d.created_at)}</span>

        {d.attempt_count > 1 && (
          <span className="text-xs text-warning-500 shrink-0">
            {d.attempt_count} attempts
          </span>
        )}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-neutral-200 px-4 py-3 bg-neutral-50 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <p className="text-neutral-400 mb-0.5">Delivered at</p>
              <p className="text-neutral-700">{fmtDate(d.delivered_at)}</p>
            </div>
            {d.next_retry_at && (
              <div>
                <p className="text-neutral-400 mb-0.5">Next retry</p>
                <p className="text-warning-500">{fmtDate(d.next_retry_at)}</p>
              </div>
            )}
          </div>
          {d.response_body && (
            <div>
              <p className="text-xs text-neutral-400 mb-1">Response body</p>
              <pre className="text-xs text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-lg p-3 overflow-x-auto max-h-28 leading-relaxed font-mono">
                {d.response_body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Endpoint card ──────────────────────────────────────────────────────────────

function EndpointCard({
  ep,
  onDelete,
  onToggle,
}: {
  ep: WebhookEndpoint;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [testing, setTesting] = useState(false);

  async function loadDeliveries() {
    setLoadingLog(true);
    try { setDeliveries(await getWebhookDeliveries(ep.id)); }
    catch { toast.error("Could not load delivery log"); }
    finally { setLoadingLog(false); }
  }

  async function toggleLog() {
    if (!showLog && deliveries === null) await loadDeliveries();
    setShowLog(s => !s);
  }

  async function sendTest() {
    setTesting(true);
    try {
      await testWebhookEndpoint(ep.id);
      toast.success("Test event sent to your endpoint");
      setTimeout(loadDeliveries, 2500);
    } catch { toast.error("Test failed — check your URL is reachable"); }
    finally { setTesting(false); }
  }

  const successCount = deliveries?.filter(d => d.response_status !== null && d.response_status < 300).length ?? null;
  const failCount = deliveries?.filter(d => d.response_status !== null && d.response_status >= 300).length ?? null;

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-opacity ${ep.is_active ? "border-neutral-200" : "border-neutral-200 opacity-60"}`}>

      {/* Status bar */}
      <div className={`h-0.5 w-full ${ep.is_active ? "bg-gradient-to-r from-green-500/60 to-green-500/10" : "bg-neutral-200"}`} />

      {/* Main row */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Icon */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${ep.is_active ? "bg-success-50 border border-green-200" : "bg-neutral-100 border border-neutral-200"}`}>
            <Globe className={`w-4 h-4 ${ep.is_active ? "text-success-600" : "text-neutral-400"}`} />
          </div>

          {/* URL + events */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-neutral-900 font-mono truncate">{ep.url}</span>
              <CopyBtn text={ep.url} />
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ep.events.map(e => (
                <span key={e} className={`text-xs px-2 py-0.5 rounded-full border font-mono ${EVENT_COLORS[e] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
                  {e}
                </span>
              ))}
            </div>
            <p className="text-xs text-neutral-400">Added {fmtDate(ep.created_at)}</p>
          </div>

          {/* Toggle + delete (always inline) */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onToggle(ep.id, !ep.is_active)}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
              title={ep.is_active ? "Disable endpoint" : "Enable endpoint"}
            >
              {ep.is_active
                ? <ToggleRight className="w-5 h-5 text-success-500" />
                : <ToggleLeft className="w-5 h-5" />}
            </button>

            <button
              onClick={() => onDelete(ep.id)}
              className="p-2 rounded-lg text-neutral-400 hover:text-error-500 hover:bg-error-50 transition-colors"
              title="Delete endpoint"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Test button — full width on mobile, compact inline on desktop */}
        <button
          onClick={sendTest}
          disabled={testing || !ep.is_active}
          className="mt-3 sm:mt-2 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg text-neutral-600 bg-neutral-50 sm:bg-transparent border border-neutral-200 sm:border-transparent hover:text-yellow-600 hover:bg-yellow-50 hover:border-yellow-200 transition-colors disabled:opacity-40"
          title="Send test event"
        >
          <Zap className="w-3.5 h-3.5" />
          {testing ? "Sending…" : "Send test event"}
        </button>

        {/* Secret one-time reveal */}
        {ep.secret && (
          <div className="mt-4 p-3.5 bg-warning-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-warning-700 font-semibold mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              Signing Secret — copy now, it won&apos;t be shown again
            </p>
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs text-warning-700 font-mono break-all min-w-0">{ep.secret}</code>
              <CopyBtn text={ep.secret} />
            </div>
            <p className="text-xs text-neutral-500 mt-1.5">Store this in your environment variables and use it to verify incoming requests.</p>
          </div>
        )}
      </div>

      {/* Delivery log section */}
      <div className="border-t border-neutral-200">
        <button
          onClick={toggleLog}
          className="w-full flex items-center gap-2.5 px-5 py-3 text-xs text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
        >
          {loadingLog
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>Delivery log</span>
          {deliveries !== null && (
            <div className="flex items-center gap-2 ml-auto">
              {successCount !== null && successCount > 0 && (
                <span className="flex items-center gap-1 text-success-600">
                  <CheckCircle2 className="w-3 h-3" />{successCount}
                </span>
              )}
              {failCount !== null && failCount > 0 && (
                <span className="flex items-center gap-1 text-error-500">
                  <XCircle className="w-3 h-3" />{failCount}
                </span>
              )}
              <span className="text-neutral-400">{deliveries.length} total</span>
            </div>
          )}
        </button>

        {showLog && deliveries && (
          <div className="px-5 pb-5 space-y-2">
            {deliveries.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-neutral-300 rounded-xl">
                <p className="text-sm text-neutral-500">No deliveries yet</p>
                <p className="text-xs text-neutral-400 mt-1">Click &quot;Test&quot; above to send a test event, or wait for a real call.</p>
              </div>
            ) : (
              deliveries.map(d => <DeliveryRow key={d.id} d={d} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add endpoint modal ─────────────────────────────────────────────────────────

function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: (ep: WebhookEndpoint) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["call.completed", "call.failed"]);
  const [loading, setLoading] = useState(false);

  function toggle(key: string) {
    setEvents(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!url.startsWith("http")) { toast.error("URL must start with https://"); return; }
    if (events.length === 0) { toast.error("Select at least one event"); return; }
    setLoading(true);
    try {
      const ep = await createWebhookEndpoint({ url, events });
      toast.success("Endpoint created — save your signing secret!");
      onAdded(ep);
      onClose();
    } catch { toast.error("Failed to create endpoint"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white border border-neutral-200 sm:rounded-2xl rounded-t-2xl w-full sm:max-w-md shadow-xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="px-5 sm:px-6 py-5 border-b border-neutral-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-500/10 border border-brand-500/25 rounded-lg flex items-center justify-center">
              <Webhook className="w-4 h-4 text-brand-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Add webhook endpoint</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Vaaniq will POST events to this URL</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 text-lg leading-none">×</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">

          {/* URL input */}
          <div>
            <label className="text-xs font-medium text-neutral-700 block mb-2">
              Endpoint URL <span className="text-error-500">*</span>
            </label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks/tierce"
              className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 transition-colors font-mono"
              required
              autoFocus
            />
            <p className="text-xs text-neutral-400 mt-1.5">Must be publicly reachable. Use <span className="text-neutral-600">https://webhook.site</span> to test.</p>
          </div>

          {/* Events */}
          <div>
            <label className="text-xs font-medium text-neutral-700 block mb-3">
              Events to listen to
            </label>
            <div className="space-y-2.5">
              {ALL_EVENTS.map(ev => (
                <label
                  key={ev.key}
                  className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${
                    events.includes(ev.key)
                      ? "border-brand-500/40 bg-brand-500/5"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={events.includes(ev.key)}
                    onChange={() => toggle(ev.key)}
                    className="mt-0.5 accent-brand-500 w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${EVENT_COLORS[ev.key]}`}>{ev.key}</span>
                    </div>
                    <p className="text-xs text-neutral-500">{ev.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Signing secret note */}
          <div className="flex items-start gap-2.5 p-3 bg-warning-50 border border-amber-200 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-600">
              A <span className="text-warning-700 font-medium">signing secret</span> will be generated and shown once after creation.
              Use it to verify that events came from Vaaniq, not a third party.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {loading ? "Creating…" : "Create endpoint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── How it works card ──────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      icon: Webhook,
      title: "You add an endpoint",
      desc: "Paste any public URL — your server, Zapier, Make, or even webhook.site to test.",
      cls: "text-brand-500 bg-brand-500/10 border-brand-500/25",
    },
    {
      icon: Zap,
      title: "A call event happens",
      desc: "When a call starts, completes, or fails — Tierce fires the event immediately.",
      cls: "text-yellow-600 bg-yellow-50 border-yellow-200",
    },
    {
      icon: Globe,
      title: "Your server receives it",
      desc: "We POST a signed JSON payload to your URL. Use it to update your CRM, send SMS, log to sheets, etc.",
      cls: "text-success-600 bg-success-50 border-green-200",
    },
  ];

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-neutral-900 mb-4">How it works</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-row sm:flex-col gap-3">
            <div className="flex sm:items-center gap-3">
              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${s.cls}`}>
                <s.icon className="w-4 h-4" />
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-neutral-300 shrink-0 hidden sm:block" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-900 mb-1">{s.title}</p>
              <p className="text-xs text-neutral-500 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Signature info (collapsible) ───────────────────────────────────────────────

function SignatureInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-50 transition-colors text-left"
      >
        <Code2 className="w-4 h-4 text-neutral-400 shrink-0" />
        <span className="text-sm text-neutral-700 font-medium">Verifying webhook signatures <span className="hidden sm:inline">(for developers)</span></span>
        <span className="ml-auto text-xs text-neutral-400 hidden sm:inline shrink-0">Optional but recommended</span>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>
      {open && (
        <div className="border-t border-neutral-200 px-5 py-4 space-y-4 bg-neutral-50">
          <p className="text-xs text-neutral-600 leading-relaxed">
            Every request includes two headers. Use them to confirm the event genuinely came from Vaaniq and wasn&apos;t tampered with.
          </p>
          <div className="space-y-2">
            <div className="rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-neutral-100 border-b border-neutral-200">
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Headers</span>
              </div>
              <pre className="bg-white px-4 py-3 text-xs text-neutral-800 font-mono leading-relaxed">{`X-Vaaniq-Signature: sha256=<hex>
X-Vaaniq-Timestamp: 1716820000`}</pre>
            </div>
            <div className="rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-neutral-100 border-b border-neutral-200">
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Python</span>
              </div>
              <pre className="bg-white px-4 py-3 text-xs text-neutral-800 font-mono leading-relaxed">{`import hmac, hashlib

def verify(secret, timestamp, body, signature):
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.{body}".encode(),
        hashlib.sha256,
    ).hexdigest()
    received = signature.replace("sha256=", "")
    return hmac.compare_digest(expected, received)`}</pre>
            </div>
          </div>
          <p className="text-xs text-neutral-500">Failed deliveries are retried after <span className="text-neutral-700">30 seconds</span> and then <span className="text-neutral-700">5 minutes</span> (3 attempts total).</p>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{open: boolean; id?: string}>({open: false});

  const load = useCallback(async () => {
    try { setEndpoints(await getWebhookEndpoints()); }
    catch { toast.error("Failed to load webhooks"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setConfirmDelete({open: true, id});
  }

  async function doDelete() {
    if (!confirmDelete.id) return;
    try {
      await deleteWebhookEndpoint(confirmDelete.id);
      setEndpoints(prev => prev.filter(ep => ep.id !== confirmDelete.id));
      toast.success("Endpoint deleted");
    } catch { toast.error("Failed to delete endpoint"); }
    finally { setConfirmDelete({open: false}); }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const updated = await updateWebhookEndpoint(id, { is_active: active });
      setEndpoints(prev => prev.map(ep => ep.id === id ? { ...ep, ...updated } : ep));
      toast.success(active ? "Endpoint enabled" : "Endpoint disabled");
    } catch { toast.error("Failed to update endpoint"); }
  }

  return (
    <div className="space-y-6">

      {/* Page actions */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Add endpoint
        </button>
      </div>

      {/* How it works */}
      <HowItWorks />

      {/* Signature info */}
      <SignatureInfo />

      {/* Endpoints */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            Your endpoints
            {endpoints.length > 0 && (
              <span className="ml-2 text-xs font-normal text-neutral-400">({endpoints.length})</span>
            )}
          </h2>
          {endpoints.length > 0 && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-brand-500 hover:text-brand-600 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add another
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-neutral-500">Loading…</span>
          </div>
        ) : endpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-neutral-300 rounded-2xl text-center gap-4">
            <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
              <Webhook className="w-6 h-6 text-neutral-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">No endpoints yet</p>
              <p className="text-xs text-neutral-400 mt-1">Add one to start receiving call events.</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" /> Add your first endpoint
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints.map(ep => (
              <EndpointCard key={ep.id} ep={ep} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={ep => setEndpoints(prev => [ep, ...prev])} />}
      <ConfirmModal
        open={confirmDelete.open}
        title="Delete Endpoint"
        message="Delete this endpoint? All delivery history will be removed."
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({open: false})}
      />
    </div>
  );
}
