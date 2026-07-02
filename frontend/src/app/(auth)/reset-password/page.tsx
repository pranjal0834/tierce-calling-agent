"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { VaaniqWave } from "@/components/VaaniqLogo";
import toast from "react-hot-toast";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";
import PasswordInput from "@/components/ui/PasswordInput";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string().min(1, "Please confirm your password"),
}).refine(d => d.password === d.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

type FormValues = z.infer<typeof schema>;

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    if (!token) {
      toast.error("Invalid or missing reset link");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/reset-password", { token, new_password: data.password });
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
        <div className="w-12 h-12 bg-success-50 border border-success-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-success-500" />
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
        <div className="bg-error-50 border border-error-200 rounded-xl px-4 py-3">
          <p className="text-sm text-error-700">This reset link is invalid or incomplete. Please request a new one.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="label-base">New password</label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={watch("password")}
              onChange={e => setValue("password", e.target.value)}
            />
            {errors.password && <p className="text-xs text-error-600 mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="confirm-new-password" className="label-base">Confirm new password</label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              value={watch("confirm_password")}
              onChange={e => setValue("confirm_password", e.target.value)}
            />
            {errors.confirm_password && <p className="text-xs text-error-600 mt-1">{errors.confirm_password.message}</p>}
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
          <VaaniqWave className="icon-md text-white" />
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
