"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Webhook, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Zap, Copy, Check, ToggleLeft, ToggleRight,
} from "lucide-react";
import toast from "react-hot-toast";
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

const ALL_EVENTS = ["call.started", "call.completed", "call.failed"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null) return <span className="text-gray-500 text-xs">—</span>;
  const ok = status >= 200 && status < 300;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded ${
      ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <p className="text-xs text-yellow-400 mb-1 font-medium">
        Save this secret — it will not be shown again
      </p>
      <div className="flex items-center gap-2">
        <code className="text-xs text-yellow-300 font-mono break-all flex-1">{secret}</code>
        <button onClick={copy} className="text-yellow-400 hover:text-yellow-200 flex-shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Delivery log row ───────────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: Delivery }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/40 transition-colors text-left"
      >
        <StatusBadge status={d.response_status} />
        <span className="text-xs font-mono text-gray-300 flex-1">{d.event_type}</span>
        <span className="text-xs text-gray-500">{fmtDate(d.created_at)}</span>
        <span className="text-xs text-gray-600">attempt {d.attempt_count}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-gray-700/50 pt-2 space-y-1">
          <div className="flex gap-2 text-xs text-gray-500">
            <span>Delivered:</span><span className="text-gray-300">{fmtDate(d.delivered_at)}</span>
          </div>
          {d.next_retry_at && (
            <div className="flex gap-2 text-xs text-gray-500">
              <span>Next retry:</span><span className="text-yellow-400">{fmtDate(d.next_retry_at)}</span>
            </div>
          )}
          {d.response_body && (
            <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 mt-1 overflow-x-auto max-h-32">
              {d.response_body}
            </pre>
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
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [testing, setTesting] = useState(false);

  async function loadDeliveries() {
    setLoadingDeliveries(true);
    try {
      const data = await getWebhookDeliveries(ep.id);
      setDeliveries(data);
    } catch {
      toast.error("Failed to load delivery log");
    } finally {
      setLoadingDeliveries(false);
    }
  }

  async function handleShowDeliveries() {
    if (!showDeliveries) {
      await loadDeliveries();
    }
    setShowDeliveries(s => !s);
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testWebhookEndpoint(ep.id);
      toast.success("Test ping sent");
      setTimeout(loadDeliveries, 2000);
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
      ep.is_active ? "border-gray-700/60" : "border-gray-800 opacity-60"
    }`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ep.is_active ? "bg-green-400" : "bg-gray-600"}`} />
            <span className="text-sm font-mono text-white truncate">{ep.url}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {ep.events.map(e => (
              <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {e}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1.5">Created {fmtDate(ep.created_at)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleTest}
            disabled={testing || !ep.is_active}
            title="Send test ping"
            className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors disabled:opacity-40"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(ep.id, !ep.is_active)}
            title={ep.is_active ? "Disable" : "Enable"}
            className="p-1.5 text-gray-500 hover:text-white transition-colors"
          >
            {ep.is_active
              ? <ToggleRight className="w-4 h-4 text-green-400" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(ep.id)}
            title="Delete"
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {ep.secret && <SecretReveal secret={ep.secret} />}

      <div className="border-t border-gray-800 px-4 py-2">
        <button
          onClick={handleShowDeliveries}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {loadingDeliveries
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : showDeliveries ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Delivery history {deliveries !== null && `(${deliveries.length})`}
        </button>
        {showDeliveries && deliveries && (
          <div className="mt-2 space-y-1.5">
            {deliveries.length === 0 ? (
              <p className="text-xs text-gray-600 py-2">No deliveries yet.</p>
            ) : (
              deliveries.map(d => <DeliveryRow key={d.id} d={d} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add endpoint form ──────────────────────────────────────────────────────────

function AddEndpointForm({ onAdded }: { onAdded: (ep: WebhookEndpoint) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["call.completed", "call.failed"]);
  const [loading, setLoading] = useState(false);

  function toggleEvent(e: string) {
    setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!url.startsWith("http")) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    if (events.length === 0) {
      toast.error("Select at least one event");
      return;
    }
    setLoading(true);
    try {
      const ep = await createWebhookEndpoint({ url, events });
      toast.success("Endpoint created");
      setUrl("");
      setEvents(["call.completed", "call.failed"]);
      onAdded(ep);
    } catch {
      toast.error("Failed to create endpoint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700/60 rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Plus className="w-4 h-4" /> Add endpoint
      </h3>
      <div>
        <label className="text-xs text-gray-400 block mb-1">URL</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://your-server.com/webhooks/tierce"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          required
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1.5">Events to subscribe</label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => toggleEvent(e)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                events.includes(e)
                  ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/40"
                  : "text-gray-500 border-gray-700 hover:border-gray-500"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? "Creating…" : "Create endpoint"}
      </button>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEndpoints = useCallback(async () => {
    try {
      const data = await getWebhookEndpoints();
      setEndpoints(data);
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEndpoints(); }, [loadEndpoints]);

  function handleAdded(ep: WebhookEndpoint) {
    setEndpoints(prev => [ep, ...prev]);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this endpoint? All delivery history will be lost.")) return;
    try {
      await deleteWebhookEndpoint(id);
      setEndpoints(prev => prev.filter(ep => ep.id !== id));
      toast.success("Endpoint deleted");
    } catch {
      toast.error("Failed to delete endpoint");
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const updated = await updateWebhookEndpoint(id, { is_active: active });
      setEndpoints(prev => prev.map(ep => ep.id === id ? { ...ep, ...updated } : ep));
      toast.success(active ? "Endpoint enabled" : "Endpoint disabled");
    } catch {
      toast.error("Failed to update endpoint");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Webhook className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Outbound Webhooks</h1>
          <p className="text-sm text-gray-500">Send real-time events to your server when calls complete</p>
        </div>
      </div>

      {/* Signing note */}
      <div className="mt-4 mb-6 p-3 bg-gray-900 border border-gray-700/50 rounded-lg text-xs text-gray-400 space-y-1">
        <p>All requests are signed with <code className="text-indigo-400">X-Tierce-Signature: sha256=&lt;hmac&gt;</code> and <code className="text-indigo-400">X-Tierce-Timestamp</code>.</p>
        <p>Verify: <code className="text-gray-300">hmac_sha256(secret, &quot;&#123;timestamp&#125;.&#123;body&#125;&quot;)</code>. Retries: 30s → 5 min (max 3 attempts).</p>
      </div>

      {/* Add form */}
      <AddEndpointForm onAdded={handleAdded} />

      {/* Endpoint list */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : endpoints.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No endpoints yet. Add one above to start receiving events.</p>
          </div>
        ) : (
          endpoints.map(ep => (
            <EndpointCard key={ep.id} ep={ep} onDelete={handleDelete} onToggle={handleToggle} />
          ))
        )}
      </div>
    </div>
  );
}
