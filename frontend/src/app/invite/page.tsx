"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import toast from "react-hot-toast";

function InviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");

  useEffect(() => {
    if (!token) { toast.error("Invalid invite link"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setInvitedEmail(payload.email || "");
    } catch { /* ignore decode errors */ }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password && password !== confirm) { toast.error("Passwords don't match"); return; }
    if (password && password.length < 8)  { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await api.post("/auth/accept-invite", null, { params: { token, password } });
      setToken(res.data.access_token);
      setDone(true);
      toast.success("Welcome! Joining workspace…");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] animate-fade-in">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-brand-500 rounded-[11px] flex items-center justify-center shadow-brand">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-2xl font-semibold tracking-tight text-neutral-900">Vaaniq</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">You&apos;ve been invited</h1>
            {invitedEmail && (
              <p className="text-sm text-neutral-500 mt-1">
                Joining as <span className="font-medium text-neutral-800">{invitedEmail}</span>
              </p>
            )}
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              If you already have an account, you&apos;ll be added to this workspace directly.
              Otherwise, set a password to create your account.
            </p>
          </div>

          {done ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-emerald-600">Joining workspace…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label-base">
                  Password
                  <span className="text-neutral-400 font-normal ml-1">(only needed for new accounts)</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-base"
                  placeholder="Leave blank if you already have an account"
                />
              </div>
              {password && (
                <div>
                  <label className="label-base">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="input-base"
                    placeholder="Repeat password"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                {loading ? "Joining…" : "Join Workspace"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
