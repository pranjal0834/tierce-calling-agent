"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Users, Globe, Copy, Check,
  Trash2, UserPlus, Shield, Crown, Bell, KeyRound, UserCircle, MessageCircle,
  Camera, MapPin, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getWorkspace, getMe, updateWorkspace,
  getMembers, removeMember, createInvite,
  getWhatsappConfig, saveWhatsappConfig, testWhatsappConfig,
  updateProfile, uploadAvatar, avatarUrl,
  api,
} from "@/lib/api";
import PasswordInput from "@/components/ui/PasswordInput";
import { toastUndo } from "@/lib/toast-undo";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Workspace { id: string; name: string; plan: string; credits_balance: number; created_at: string; }
interface Me {
  id: string; email: string; role: string; has_password?: boolean;
  full_name?: string | null; avatar_url?: string | null; phone?: string | null;
  address_line?: string | null; city?: string | null; state?: string | null;
  country?: string | null; postal_code?: string | null;
}
interface Member { id: string; email: string; role: string; is_active: boolean; created_at: string; }

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
      {copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Section card wrapper ────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, action, children }: {
  title: string; description?: string; icon?: React.ElementType;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-brand-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
            {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── General section (workspace) ──────────────────────────────────────────────────

function GeneralSection({ workspace, me, onSaved }: { workspace: Workspace; me: Me; onSaved: () => void }) {
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
    <div className="space-y-5">
      <SectionCard title="Workspace" description="Your workspace name is visible to all team members." icon={Globe}>
        <label htmlFor="workspace-name" className="block text-sm text-neutral-700 font-medium mb-1.5">Workspace Name</label>
        <div className="flex flex-col sm:flex-row gap-2 max-w-md">
          <input
            id="workspace-name"
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
        {!isOwner && (
          <p className="text-xs text-neutral-400 mt-2">Only the workspace owner can change this.</p>
        )}
      </SectionCard>

      <SectionCard title="Workspace Details" description="Read-only information about this workspace.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div className="flex items-center justify-between gap-3 sm:block">
            <p className="text-xs text-neutral-500 sm:mb-1">Workspace ID</p>
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs text-neutral-700 font-mono truncate">{workspace.id}</p>
              <CopyButton text={workspace.id} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:block">
            <p className="text-xs text-neutral-500 sm:mb-1">Plan</p>
            <p className="text-sm font-medium text-neutral-900 capitalize">{workspace.plan}</p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:block">
            <p className="text-xs text-neutral-500 sm:mb-1">Credit Balance</p>
            <p className="text-sm font-medium text-neutral-900">{workspace.credits_balance.toFixed(1)} minutes</p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:block">
            <p className="text-xs text-neutral-500 sm:mb-1">Your Role</p>
            <div className="flex items-center gap-1.5">
              {me.role === "owner" ? <Crown className="w-3.5 h-3.5 text-yellow-500" /> : <Shield className="w-3.5 h-3.5 text-blue-500" />}
              <p className="text-sm font-medium text-neutral-900 capitalize">{me.role}</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Account section (profile + password) ─────────────────────────────────────────

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-neutral-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function ProfileCard({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: me.full_name ?? "", email: me.email ?? "", phone: me.phone ?? "",
    address_line: me.address_line ?? "", city: me.city ?? "", state: me.state ?? "",
    country: me.country ?? "", postal_code: me.postal_code ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.email.trim()) { toast.error("Email is required"); return; }
    setSaving(true);
    try {
      await updateProfile(form);
      toast.success("Profile updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to update profile");
    } finally { setSaving(false); }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image too large (max 2 MB)"); return; }
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast.success("Profile picture updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const initial = (me.full_name || me.email || "?").trim()[0]?.toUpperCase() || "?";
  const img = avatarUrl(me.avatar_url);

  return (
    <SectionCard title="Profile" description="Your name, photo, contact details, and address." icon={UserCircle}>
      <div className="space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="Profile" className="w-16 h-16 rounded-full object-cover border border-neutral-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xl font-semibold text-brand-600">{initial}</div>
          )}
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickAvatar} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white hover:bg-neutral-50 rounded-lg text-sm font-medium text-neutral-600 transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} {uploading ? "Uploading…" : "Change photo"}
            </button>
            <p className="text-xs text-neutral-400 mt-1">PNG, JPG, WEBP or GIF · max 2 MB</p>
          </div>
        </div>

        {/* Basic details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileField label="Full name">
            <input className="input-base" value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Your name" />
          </ProfileField>
          <ProfileField label="Email">
            <input className="input-base" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@company.com" />
          </ProfileField>
          <ProfileField label="Phone">
            <input className="input-base" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98XXXXXXXX" />
          </ProfileField>
          <ProfileField label="Role">
            <div className="flex items-center gap-1.5 h-[42px]">
              {me.role === "owner" ? <Crown className="w-3.5 h-3.5 text-yellow-500" /> : <Shield className="w-3.5 h-3.5 text-blue-500" />}
              <span className="text-sm font-medium text-neutral-900 capitalize">{me.role}</span>
            </div>
          </ProfileField>
        </div>

        {/* Address */}
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <ProfileField label="Street address">
                <input className="input-base" value={form.address_line} onChange={e => set("address_line", e.target.value)} placeholder="Building, street, area" />
              </ProfileField>
            </div>
            <ProfileField label="City">
              <input className="input-base" value={form.city} onChange={e => set("city", e.target.value)} placeholder="e.g. Ahmedabad" />
            </ProfileField>
            <ProfileField label="State / Province">
              <input className="input-base" value={form.state} onChange={e => set("state", e.target.value)} placeholder="e.g. Gujarat" />
            </ProfileField>
            <ProfileField label="Country">
              <input className="input-base" value={form.country} onChange={e => set("country", e.target.value)} placeholder="e.g. India" />
            </ProfileField>
            <ProfileField label="Postal code">
              <input className="input-base" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="e.g. 380001" />
            </ProfileField>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function AccountSection({ me, onSaved }: { me: Me; onSaved: () => void }) {
  return (
    <div className="space-y-5">
      <ProfileCard me={me} onSaved={onSaved} />
      <ChangePasswordCard me={me} onSaved={onSaved} />
    </div>
  );
}

// ── Change password ─────────────────────────────────────────────────────────────

function ChangePasswordCard({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const hasPassword = me.has_password !== false; // default to true unless explicitly false
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (hasPassword && !current) { toast.error("Enter your current password"); return; }
    if (next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("New passwords do not match"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast.success(hasPassword ? "Password changed" : "Password set");
      setCurrent(""); setNext(""); setConfirm("");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-neutral-900">
          {hasPassword ? "Change Password" : "Set a Password"}
        </h3>
      </div>
      <p className="text-xs text-neutral-500">
        {hasPassword
          ? "Enter your current password and choose a new one."
          : "Your account uses Google sign-in. Set a password to also log in with email."}
      </p>

      <div className="space-y-3 max-w-md">
        {hasPassword && (
          <div>
            <label htmlFor="current-password" className="label-base">Current password</label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              placeholder="Your current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="new-password" className="label-base">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="label-base">Confirm new password</label>
          <PasswordInput
            id="confirm-new-password"
            autoComplete="new-password"
            placeholder="Re-enter new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-xs"
        >
          {saving ? "Saving…" : hasPassword ? "Change Password" : "Set Password"}
        </button>
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
    try {
      await removeMember(id);
      setMembers((m) => m.filter((x) => x.id !== id));
      toastUndo({
        message: "Member removed",
        onUndo: async () => {
          try {
            await createInvite(email, "member");
            toast.success("Invite sent to re-added member");
          } catch {
            toast.error("Failed to restore member");
          }
        },
      });
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

// ── WhatsApp section ─────────────────────────────────────────────────────────────

function WhatsAppSection() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [masked, setMasked] = useState("");
  const [systemAvailable, setSystemAvailable] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const load = useCallback(async () => {
    try {
      const c = await getWhatsappConfig();
      setConnected(!!c.connected);
      setMasked(c.api_key_masked || "");
      setSystemAvailable(c.system_available !== false);
    } catch {
      toast.error("Failed to load WhatsApp settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const r = await saveWhatsappConfig(apiKey.trim());
      setConnected(!!r.connected);
      setMasked(r.api_key_masked || "");
      setApiKey("");
      toast.success(r.connected ? "WhatsApp connected" : "WhatsApp disconnected");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      await saveWhatsappConfig("");
      setConnected(false); setMasked(""); setApiKey("");
      toastUndo({
        message: "WhatsApp disconnected",
        onUndo: async () => {
          toast.error("Reconnect by pasting your API key above");
        },
      });
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!testTo.trim()) { toast.error("Enter a number to test (e.g. +9198…)"); return; }
    setTesting(true);
    try {
      await testWhatsappConfig(testTo.trim());
      toast.success("Test message sent ✓");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="WhatsApp"
        description="Connect your own WhatsApp so agents can message callers from your number."
        icon={MessageCircle}
        action={connected
          ? <span className="text-xs font-medium text-success-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full">Connected</span>
          : <span className="text-xs font-medium text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-1 rounded-full">Not connected</span>}
      >
        {!systemAvailable && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            The WhatsApp relay isn’t configured on the platform yet. Contact support to enable it.
          </div>
        )}

        <div className="text-xs text-neutral-500 leading-relaxed mb-4">
          Create an account in the <span className="font-medium text-neutral-700">Vaaniq WhatsApp automation system</span>,
          connect your number there, then paste its <span className="font-medium text-neutral-700">API key</span> below.
          Messages will then send from <span className="font-medium text-neutral-700">your own WhatsApp number</span>.
        </div>

        {connected && (
          <div className="mb-4 flex items-center justify-between gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <span className="text-sm text-neutral-700 font-mono">{masked}</span>
            <button onClick={disconnect} disabled={saving}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Disconnect</button>
          </div>
        )}

        <label htmlFor="whatsapp-api-key" className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5 block">
          {connected ? "Replace API Key" : "API Key"}
        </label>
        <div className="flex gap-2">
          <input
            id="whatsapp-api-key"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your WhatsApp system API key"
            className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 font-mono"
          />
          <button
            onClick={save}
            disabled={saving || !apiKey.trim()}
            className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </SectionCard>

      {connected && (
        <SectionCard title="Send a test message" description="Verify the connection by sending yourself a WhatsApp.">
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="+919812345678"
              className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 font-mono"
            />
            <button
              onClick={test}
              disabled={testing || !testTo.trim()}
              className="px-4 py-2 text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"general" | "account" | "whatsapp" | "notifications" | "team">("general");
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

  const SECTIONS = [
    { key: "general",       label: "General",       icon: Globe },
    { key: "account",       label: "Account",       icon: UserCircle },
    { key: "whatsapp",      label: "WhatsApp",      icon: MessageCircle },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "team",          label: "Team",          icon: Users },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Horizontal section tabs */}
      <div className="border-b border-neutral-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {SECTIONS.map((s) => {
            const active = tab === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setTab(s.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <s.icon className={`w-4 h-4 ${active ? "text-brand-500" : "text-neutral-400"}`} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section content */}
      <div className="max-w-3xl">
        {tab === "general"       && <GeneralSection workspace={workspace} me={me} onSaved={load} />}
        {tab === "account"       && <AccountSection me={me} onSaved={load} />}
        {tab === "whatsapp"      && <WhatsAppSection />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "team"          && <TeamTab me={me} />}
      </div>
    </div>
  );
}
