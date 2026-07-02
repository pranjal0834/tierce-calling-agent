"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { VaaniqWave } from "@/components/VaaniqLogo";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InputField } from "@/components/ui/FormField";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: data.email });
      setSent(true);
    } catch {
      // Still show success to avoid leaking which emails exist
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 justify-center mb-8">
        <div className="w-9 h-9 bg-brand-500 rounded-[11px] flex items-center justify-center shadow-brand">
          <VaaniqWave className="icon-md text-white" />
        </div>
        <span className="text-2xl font-semibold tracking-tight text-neutral-900">Vaaniq</span>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal p-6 sm:p-8">
        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-success-50 border border-success-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-6 h-6 text-success-500" />
            </div>
            <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Check your email</h1>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              If an account exists for <span className="font-medium text-neutral-800">{watch("email")}</span>,
              we&apos;ve sent a password reset link. It expires in 30 minutes.
            </p>
            <p className="text-xs text-neutral-400 mt-3">
              Didn&apos;t get it? Check your spam folder, or{" "}
              <button
                onClick={() => setSent(false)}
                className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                try again
              </button>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Forgot password?</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <InputField
                label="Email"
                id="email"
                registration={register("email")}
                error={errors.email}
                type="email"
                placeholder="you@company.com"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-xs hover:shadow-brand/20 active:scale-[0.99]"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mt-5 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </Link>
    </>
  );
}
