"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Users, Globe, Copy, Check,
  Trash2, UserPlus, Shield, Crown, Bell,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getWorkspace, getMe, updateWorkspace,
  getMembers, removeMember, createInvite,
  api,
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
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-brand-500 text-brand-500"
          : "border-transparent text-neutral-500 hover:text-neutral-900"
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
    <button onClick={copy} className="text-neutral-400 hover:text-neutral-900 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
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
        <label className="block text-sm text-neutral-700 font-medium mb-1.5">Workspace Name</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner}
            className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900 text-sm focus:outline-none focus:border-brand-500 disabled:opacity-50 disabled:bg-neutral-50"
          />
          {isOwner && (
            <button
              onClick={save}
              disabled={saving || name.trim() === workspace.name}
              className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">Workspace ID</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-neutral-700 font-mono truncate">{workspace.id}</p>
            <CopyButton text={workspace.id} />
          </div>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">Plan</p>
          <p className="text-sm font-medium text-neutral-900 capitalize">{workspace.plan}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">Credit Balance</p>
          <p className="text-sm font-medium text-neutral-900">{workspace.credits_balance.toFixed(1)} minutes</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">Your Role</p>
          <div className="flex items-center gap-1.5">
            {me.role === "owner" ? <Crown className="w-3.5 h-3.5 text-yellow-500" /> : <Shield className="w-3.5 h-3.5 text-blue-500" />}
            <p className="text-sm font-medium text-neutral-900 capitalize">{me.role}</p>
          </div>
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <p className="text-xs text-neutral-500 mb-1">Your Email</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-neutral-700">{me.email}</p>
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
        <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-brand-500" /> Invite Team Member
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900 text-sm focus:outline-none focus:border-brand-500"
            />
            <div className="flex gap-2">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="flex-1 sm:flex-none bg-white border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900 text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
              <button
                onClick={invite}
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                {inviting ? "…" : "Generate Link"}
              </button>
            </div>
          </div>

          {inviteLink && (
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
              <p className="flex-1 text-xs text-neutral-700 font-mono truncate">{inviteLink}</p>
              <CopyButton text={inviteLink} />
            </div>
          )}
          {inviteLink && (
            <p className="text-xs text-neutral-500">Share this link with your colleague. It expires in 7 days.</p>
          )}
        </div>
      )}

      {/* Members list */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
          Members ({members.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-neutral-100">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center text-xs font-medium text-brand-600 shrink-0">
                      {m.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-900 truncate">{m.email}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {m.role === "owner"
                          ? <Crown className="w-3 h-3 text-yellow-500 shrink-0" />
                          : <Shield className="w-3 h-3 text-blue-500 shrink-0" />}
                        <p className="text-xs text-neutral-500 capitalize">{m.role}</p>
                      </div>
                    </div>
                  </div>
                  {isOwner && m.id !== me.id && (
                    <button
                      onClick={() => remove(m.id, m.email)}
                      className="text-neutral-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {m.id === me.id && (
                    <span className="text-xs text-neutral-400 px-2 py-1 bg-neutral-100 rounded-full shrink-0">You</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

interface NotifPrefs {
  announcement_emails: boolean;
  low_credits_alert: boolean;
  call_summary_emails: boolean;
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-neutral-100 last:border-0">
      <div className="pr-6">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors duration-150 flex-shrink-0 ${
          checked ? "bg-brand-500" : "bg-neutral-200"
        }`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-xs transition-transform duration-150 ${
          checked ? "translate-x-5" : "translate-x-1"
        }`} />
      </button>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<NotifPrefs>("/api/notifications/preferences")
      .then(r => setPrefs(r.data))
      .catch(() => toast.error("Failed to load notification preferences"));
  }, []);

  const update = async (patch: Partial<NotifPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const r = await api.put<NotifPrefs>("/api/notifications/preferences", patch);
      setPrefs(r.data);
    } catch {
      toast.error("Failed to save preferences");
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-neutral-200 rounded-xl shadow-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-neutral-900">Email Notifications</h3>
          {saving && <span className="text-xs text-neutral-400 animate-pulse">Saving…</span>}
        </div>
        <p className="text-xs text-neutral-500 mb-5">
          Choose which emails you receive from Vaaniq. Welcome and billing emails are always sent automatically.
        </p>

        <ToggleRow
          label="Product announcements"
          description="New features, improvements, and platform updates from the Vaaniq team."
          checked={prefs.announcement_emails}
          onChange={v => update({ announcement_emails: v })}
        />
        <ToggleRow
          label="Low credits alert"
          description="Get notified when your call minutes balance drops below 5 minutes."
          checked={prefs.low_credits_alert}
          onChange={v => update({ low_credits_alert: v })}
        />
        <ToggleRow
          label="Call summary emails"
          description="Receive a summary email after each completed call with transcript and insights."
          checked={prefs.call_summary_emails}
          onChange={v => update({ call_summary_emails: v })}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<"general" | "team" | "notifications">("general");
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
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Manage your workspace, team, and account preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-neutral-200 overflow-x-auto">
        <Tab label="General"       icon={Globe}  active={tab === "general"}       onClick={() => setTab("general")}       />
        <Tab label="Team"          icon={Users}  active={tab === "team"}           onClick={() => setTab("team")}          />
        <Tab label="Notifications" icon={Bell}   active={tab === "notifications"}  onClick={() => setTab("notifications")} />
      </div>

      {/* Content */}
      {tab === "general"       && <GeneralTab workspace={workspace} me={me} onSaved={load} />}
      {tab === "team"          && <TeamTab me={me} />}
      {tab === "notifications" && <NotificationsTab />}
    </div>
  );
}
