"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Key, Copy, Check, Trash2,
  Terminal, Globe, Zap, Phone, CalendarClock, BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { getApiKeys, createApiKey, revokeApiKey, getWorkspace } from "@/lib/api";

interface ApiKey { id: string; name: string; last_used_at?: string; created_at: string; }
interface Workspace { id: string; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} title="Copy" className="text-neutral-400 hover:text-neutral-900 transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-100 border-b border-neutral-200">
        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">{language}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          {copied
            ? <><Check className="w-3 h-3 text-green-500" /> Copied</>
            : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      {/* Code body */}
      <pre className="bg-white px-4 py-4 text-xs text-neutral-800 font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "Never";
  const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  return new Date(utc).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── API Keys Section ──────────────────────────────────────────────────────────

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");

  const load = useCallback(async () => {
    try { setKeys(await getApiKeys()); }
    catch { toast.error("Failed to load API keys"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createApiKey(newName.trim());
      setNewKey(res.key);
      setNewName("");
      await load();
      toast.success("API key created");
    } catch {
      toast.error("Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return;
    try {
      await revokeApiKey(id);
      setKeys((k) => k.filter((x) => x.id !== id));
      toast.success("Key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <div className="space-y-4">
      {/* Create */}
      <div className="bg-white border border-neutral-200 shadow-sm rounded-xl p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
          <Key className="w-4 h-4 text-brand-500" /> Create New API Key
        </h3>
        <p className="text-xs text-neutral-500">
          Give each key a descriptive name so you know where it&apos;s used. The raw key is shown only once — store it securely.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            placeholder="e.g. Production, CRM Integration, Zapier"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900 text-sm focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
          >
            {creating ? "Creating…" : "Create Key"}
          </button>
        </div>

        {newKey && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-600">
              <Zap className="w-3.5 h-3.5" />
              <p className="text-xs font-semibold">Copy this key now — it won&apos;t be shown again.</p>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="flex-1 text-xs text-amber-800 font-mono break-all">{newKey}</p>
              <CopyButton text={newKey} />
            </div>
          </div>
        )}
      </div>

      {/* Keys list */}
      <div>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-sm border border-dashed border-neutral-300 rounded-xl">
            No API keys yet — create one above
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 shadow-sm rounded-xl overflow-hidden">
            <div className="divide-y divide-neutral-100">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/25 flex items-center justify-center shrink-0">
                      <Key className="w-3.5 h-3.5 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-900 font-medium truncate">{k.name}</p>
                      <p className="text-xs text-neutral-400 truncate">
                        Created {fmtDate(k.created_at)} · Last used {fmtDate(k.last_used_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(k.id, k.name)}
                    className="text-neutral-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 shrink-0"
                    title="Revoke key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const BASE_URL = typeof window !== "undefined"
  ? window.location.origin
  : "https://your-domain.com";

const ENDPOINTS = [
  { method: "POST", path: "/api/calls/initiate",   label: "Initiate a call",         icon: Phone },
  { method: "POST", path: "/api/calls/bulk",        label: "Bulk dial campaign",       icon: Phone },
  { method: "GET",  path: "/api/calls",             label: "List all calls",           icon: Phone },
  { method: "GET",  path: "/api/calls/{id}/detail", label: "Call detail + transcript", icon: Phone },
  { method: "POST", path: "/api/scheduling",        label: "Schedule a call",          icon: CalendarClock },
  { method: "POST", path: "/api/scheduling/bulk",   label: "Bulk schedule contacts",   icon: CalendarClock },
  { method: "GET",  path: "/api/agents",            label: "List agents",              icon: Zap },
  { method: "GET",  path: "/api/analytics/agent/{id}", label: "Agent analytics",      icon: Zap },
];

export default function DevelopersPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    getWorkspace().then(setWorkspace).catch(() => {});
  }, []);

  const authExample = `curl ${BASE_URL}/api/calls \\
  -H "X-API-Key: trc_your_key_here"`;

  const initiateExample = `curl -X POST ${BASE_URL}/api/calls/initiate \\
  -H "X-API-Key: trc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "your-agent-id",
    "phone_number": "+919876543210"
  }'`;

  const scheduleExample = `curl -X POST ${BASE_URL}/api/scheduling \\
  -H "X-API-Key: trc_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "your-agent-id",
    "phone_number": "+919876543210",
    "contact_name": "Rahul Sharma",
    "scheduled_at": "2026-05-26T10:00:00+05:30",
    "timezone": "Asia/Kolkata"
  }'`;

  const jsExample = `const response = await fetch("${BASE_URL}/api/calls/initiate", {
  method: "POST",
  headers: {
    "X-API-Key": "trc_your_key_here",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agent_id: "your-agent-id",
    phone_number: "+919876543210",
  }),
});
const call = await response.json();
console.log(call.id); // call ID for tracking`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Developers</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Use the Vaaniq API to automate calls, integrate with your CRM, or build your own workflows. All endpoints accept API key authentication.
        </p>
      </div>

      {/* Base URL */}
      <div className="bg-white border border-neutral-200 shadow-sm rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-neutral-400 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-900">Base URL</h2>
          {workspace && (
            <span className="ml-auto text-xs text-neutral-400 truncate min-w-0">Workspace: <span className="text-neutral-700">{workspace.name}</span></span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
          <code className="flex-1 text-xs sm:text-sm text-brand-600 font-mono break-all min-w-0">{BASE_URL}/api</code>
          <CopyButton text={`${BASE_URL}/api`} />
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-neutral-400" />
          <h2 className="text-base font-semibold text-neutral-900">Authentication</h2>
        </div>
        <p className="text-sm text-neutral-600">
          Pass your API key in the <code className="text-brand-600 bg-brand-500/10 px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header on every request.
          The key acts as the workspace owner — it has full access to all agents, calls, and data in your workspace.
        </p>
        <CodeBlock code={authExample} language="bash" />
      </div>

      {/* Quick Start */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-neutral-400" />
          <h2 className="text-base font-semibold text-neutral-900">Quick Start</h2>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">Initiate an outbound call</p>
            <CodeBlock code={initiateExample} language="bash" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">Schedule a call</p>
            <CodeBlock code={scheduleExample} language="bash" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">JavaScript / TypeScript</p>
            <CodeBlock code={jsExample} language="javascript" />
          </div>
        </div>
      </div>

      {/* Endpoints reference */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">Endpoints Reference</h2>
        <div className="rounded-xl border border-neutral-200 overflow-hidden shadow-xs overflow-x-auto">
          {/* Table header */}
          <div className="grid grid-cols-[72px_1fr_1fr] bg-neutral-100 border-b border-neutral-200 px-4 py-2.5 min-w-[480px]">
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Method</span>
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Endpoint</span>
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Description</span>
          </div>
          {/* Rows */}
          {ENDPOINTS.map((ep, i) => (
            <div
              key={i}
              className="grid grid-cols-[72px_1fr_1fr] items-center px-4 py-3.5 bg-white border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors min-w-[480px]"
            >
              {/* Method badge */}
              <div>
                <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${
                  ep.method === "POST"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}>
                  {ep.method}
                </span>
              </div>
              {/* Path */}
              <code className="text-xs text-neutral-800 font-mono bg-neutral-100 border border-neutral-200 rounded-md px-2 py-1 w-fit">
                {ep.path}
              </code>
              {/* Description */}
              <span className="text-xs text-neutral-600">{ep.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-400">
          Full interactive docs available at{" "}
          <code className="text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded text-[11px]">{BASE_URL}/docs</code>
          {" "}(FastAPI Swagger UI).
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200" />

      {/* API Keys section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-neutral-400" />
          <h2 className="text-base font-semibold text-neutral-900">API Keys</h2>
        </div>
        <ApiKeysSection />
      </div>
    </div>
  );
}
