"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Code2, Key, Copy, Check, Trash2, RefreshCw,
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
    <button onClick={copy} title="Copy" className="text-gray-500 hover:text-white transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
      <span className="absolute top-2 left-3 text-xs text-gray-600 font-sans">{language}</span>
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
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-indigo-400" /> Create New API Key
        </h3>
        <p className="text-xs text-gray-500">
          Give each key a descriptive name so you know where it&apos;s used. The raw key is shown only once — store it securely.
        </p>
        <div className="flex gap-2">
          <input
            placeholder="e.g. Production, CRM Integration, Zapier"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Key"}
          </button>
        </div>

        {newKey && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400">
              <Zap className="w-3.5 h-3.5" />
              <p className="text-xs font-semibold">Copy this key now — it won&apos;t be shown again.</p>
            </div>
            <div className="flex items-center gap-2 bg-gray-900 border border-yellow-500/30 rounded-lg px-3 py-2.5">
              <p className="flex-1 text-xs text-yellow-300 font-mono break-all">{newKey}</p>
              <CopyButton text={newKey} />
            </div>
          </div>
        )}
      </div>

      {/* Keys list */}
      <div>
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-gray-600 animate-spin" /></div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
            No API keys yet — create one above
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                    <Key className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{k.name}</p>
                    <p className="text-xs text-gray-500">
                      Created {fmtDate(k.created_at)} · Last used {fmtDate(k.last_used_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => revoke(k.id, k.name)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Code2 className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Developers</h1>
          <p className="text-sm text-gray-400 mt-1">
            Use the Tierce API to automate calls, integrate with your CRM, or build your own workflows. All endpoints accept API key authentication.
          </p>
        </div>
      </div>

      {/* Base URL */}
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Base URL</h2>
          {workspace && (
            <span className="ml-auto text-xs text-gray-500">Workspace: <span className="text-gray-300">{workspace.name}</span></span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5">
          <code className="flex-1 text-sm text-indigo-300 font-mono">{BASE_URL}/api</code>
          <CopyButton text={`${BASE_URL}/api`} />
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <h2 className="text-base font-semibold text-white">Authentication</h2>
        </div>
        <p className="text-sm text-gray-400">
          Pass your API key in the <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header on every request.
          The key acts as the workspace owner — it has full access to all agents, calls, and data in your workspace.
        </p>
        <CodeBlock code={authExample} language="bash" />
      </div>

      {/* Quick Start */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-gray-400" />
          <h2 className="text-base font-semibold text-white">Quick Start</h2>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Initiate an outbound call</p>
            <CodeBlock code={initiateExample} language="bash" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Schedule a call</p>
            <CodeBlock code={scheduleExample} language="bash" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">JavaScript / TypeScript</p>
            <CodeBlock code={jsExample} language="javascript" />
          </div>
        </div>
      </div>

      {/* Endpoints reference */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-white">Endpoints Reference</h2>
        <div className="border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/60 border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium w-16">Method</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Path</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((ep, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold font-mono ${
                      ep.method === "POST" ? "text-green-400" : "text-blue-400"
                    }`}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-gray-300 font-mono">{ep.path}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{ep.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          Full interactive docs available at <code className="text-gray-500">{BASE_URL}/docs</code> (FastAPI Swagger UI).
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* API Keys section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-400" />
          <h2 className="text-base font-semibold text-white">API Keys</h2>
        </div>
        <ApiKeysSection />
      </div>
    </div>
  );
}
