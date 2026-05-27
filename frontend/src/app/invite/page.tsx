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

  // Decode email from the JWT payload (middle part, base64)
  const [invitedEmail, setInvitedEmail] = useState("");
  useEffect(() => {
    if (!token) { toast.error("Invalid invite link"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setInvitedEmail(payload.email || "");
    } catch {
      // ignore decode errors
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password && password !== confirm) { toast.error("Passwords don't match"); return; }
    if (password && password.length < 8) { toast.error("Password must be at least 8 characters"); return; }

    setLoading(true);
    try {
      const res = await api.post("/auth/accept-invite", null, {
        params: { token, password },
      });
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Tierce</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h1 className="text-xl font-semibold text-white mb-1">You&apos;ve been invited</h1>
          {invitedEmail && (
            <p className="text-sm text-gray-400 mb-1">
              Invited as <span className="text-white font-medium">{invitedEmail}</span>
            </p>
          )}
          <p className="text-sm text-gray-500 mb-6">
            If you already have an account, you&apos;ll be added to this workspace directly.
            Otherwise set a password to create your account.
          </p>

          {done ? (
            <p className="text-center text-green-400 py-4">Joining workspace…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Password <span className="text-gray-600">(only needed for new accounts)</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Leave blank if you already have an account"
                />
              </div>
              {password && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Repeat password"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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
