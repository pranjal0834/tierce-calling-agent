"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap, ArrowLeft, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";
import PasswordInput from "@/components/ui/PasswordInput";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Invalid or missing reset link");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/reset-password", { token, new_password: password });
      setToken(res.data.access_token);
      setDone(true);
      toast.success("Password updated!");
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to reset password");
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal p-6 sm:p-8 text-center">
        <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Password updated</h1>
        <p className="text-sm text-neutral-500 mt-2">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal p-6 sm:p-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Set a new password</h1>
        <p className="text-sm text-neutral-500 mt-1">Choose a strong password you don&apos;t use elsewhere.</p>
      </div>

      {!token ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">This reset link is invalid or incomplete. Please request a new one.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-base">New password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label-base">Confirm new password</label>
            <PasswordInput
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-xs hover:shadow-brand/20 active:scale-[0.99]"
          >
            {loading ? "Updating…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 justify-center mb-8">
        <div className="w-9 h-9 bg-brand-500 rounded-[11px] flex items-center justify-center shadow-brand">
          <Zap className="w-4.5 h-4.5 text-white" />
        </div>
        <span className="text-2xl font-semibold tracking-tight text-neutral-900">Vaaniq</span>
      </div>

      <Suspense>
        <ResetForm />
      </Suspense>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mt-5 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </Link>
    </>
  );
}
