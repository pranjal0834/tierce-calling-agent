"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Settings, Users, Globe, Copy, Check,
  Trash2, UserPlus, RefreshCw, Shield, Crown,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getWorkspace, getMe, updateWorkspace,
  getMembers, removeMember, createInvite,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Workspace { id: string; name: string; plan: string; credits_balance: number; created_at: string; }
interface Me { id: string; email: string; role: string; }
interface Member { id: string; email: string; role: string; is_active: boolean; created_at: string; }
// ── Tab pill ──────────────────────────────────────────────────────────────────

function Tab({ label, icon: Icon, active, onClick }: { label: string; icon: React.ElementType; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "text-gray-400 hover:text-white hover:bg-gray-800"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Copy helper ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="text-gray-500 hover:text-white transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({ workspace, me, onSaved }: { workspace: Workspace; me: Me; onSaved: () => void }) {
  const [name, setName] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const isOwner = me.role === "owner";

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateWorkspace(name.trim());
      toast.success("Workspace name updated");
      onSaved();
    } catch {
      toast.error("Failed to update workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <label className="block text-sm text-gray-400 mb-1.5">Workspace Name</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          {isOwner && (
            <button
              onClick={save}
              disabled={saving || name.trim() === workspace.name}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Workspace ID</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-300 font-mono truncate">{workspace.id}</p>
            <CopyButton text={workspace.id} />
          </div>
        </div>
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Plan</p>
          <p className="text-sm font-medium text-white capitalize">{workspace.plan}</p>
        </div>
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Credit Balance</p>
          <p className="text-sm font-medium text-white">{workspace.credits_balance.toFixed(1)} minutes</p>
        </div>
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Your Role</p>
          <div className="flex items-center gap-1.5">
            {me.role === "owner" ? <Crown className="w-3.5 h-3.5 text-yellow-400" /> : <Shield className="w-3.5 h-3.5 text-blue-400" />}
            <p className="text-sm font-medium text-white capitalize">{me.role}</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">Your Email</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-300">{me.email}</p>
          <CopyButton text={me.email} />
        </div>
      </div>
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────────

function TeamTab({ me }: { me: Me }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const isOwner = me.role === "owner";

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers());
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await createInvite(inviteEmail.trim(), inviteRole);
      setInviteLink(res.invite_url);
      toast.success("Invite link created");
    } catch {
      toast.error("Failed to create invite");
    } finally {
      setInviting(false);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove ${email} from the workspace?`)) return;
    try {
      await removeMember(id);
      setMembers((m) => m.filter((x) => x.id !== id));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  }

  return (
    <div className="space-y-6">
      {/* Invite */}
      {isOwner && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-400" /> Invite Team Member
          </h3>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
            <button
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {inviting ? "…" : "Generate Link"}
            </button>
          </div>

          {inviteLink && (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5">
              <p className="flex-1 text-xs text-gray-300 font-mono truncate">{inviteLink}</p>
              <CopyButton text={inviteLink} />
            </div>
          )}
          {inviteLink && (
            <p className="text-xs text-gray-500">Share this link with your colleague. It expires in 7 days.</p>
          )}
        </div>
      )}

      {/* Members list */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">
          Members ({members.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-gray-600 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-medium text-indigo-400">
                    {m.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white">{m.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {m.role === "owner"
                        ? <Crown className="w-3 h-3 text-yellow-400" />
                        : <Shield className="w-3 h-3 text-blue-400" />}
                      <p className="text-xs text-gray-500 capitalize">{m.role}</p>
                    </div>
                  </div>
                </div>
                {isOwner && m.id !== me.id && (
                  <button
                    onClick={() => remove(m.id, m.email)}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {m.id === me.id && (
                  <span className="text-xs text-gray-600 px-2 py-1 bg-gray-800 rounded-full">You</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── API Keys Tab ───────────────────────────────────────────────────────────────

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<"general" | "team">("general");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ws, user] = await Promise.all([getWorkspace(), getMe()]);
      setWorkspace(ws);
      setMe(user);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !workspace || !me) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-4">
        <Tab label="General" icon={Globe}  active={tab === "general"} onClick={() => setTab("general")} />
        <Tab label="Team"    icon={Users}  active={tab === "team"}    onClick={() => setTab("team")}    />
      </div>

      {/* Content */}
      {tab === "general" && <GeneralTab workspace={workspace} me={me} onSaved={load} />}
      {tab === "team"    && <TeamTab me={me} />}
    </div>
  );
}
