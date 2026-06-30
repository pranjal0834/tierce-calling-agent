"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { VaaniqWave } from "@/components/VaaniqLogo";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import toast from "react-hot-toast";
import PasswordInput from "@/components/ui/PasswordInput";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  password: z.string().default(""),
  confirm_password: z.string().default(""),
}).superRefine((data, ctx) => {
  if (data.password && data.password.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must be at least 8 characters",
      path: ["password"],
    });
  }
  if (data.password && data.password !== data.confirm_password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords don't match",
      path: ["confirm_password"],
    });
  }
});

type FormValues = z.infer<typeof schema>;

function InviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!token) { toast.error("Invalid invite link"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setInvitedEmail(payload.email || "");
    } catch { /* ignore decode errors */ }
  }, [token]);

  async function onSubmit(data: FormValues) {
    setLoading(true);
    try {
      const res = await api.post("/auth/accept-invite", null, { params: { token, password: data.password } });
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
            <VaaniqWave className="icon-md text-white" />
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
              <p className="text-sm font-medium text-success-600">Joining workspace…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label-base">
                  Password
                  <span className="text-neutral-400 font-normal ml-1">(only needed for new accounts)</span>
                </label>
                <PasswordInput
                  value={watch("password") || ""}
                  onChange={e => setValue("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder="Leave blank if you already have an account"
                />
                {errors.password && <p className="text-xs text-error-600 mt-1">{errors.password.message}</p>}
              </div>
              {watch("password") && (
                <div>
                  <label className="label-base">Confirm password</label>
                  <PasswordInput
                    value={watch("confirm_password") || ""}
                    onChange={e => setValue("confirm_password", e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                  />
                  {errors.confirm_password && <p className="text-xs text-error-600 mt-1">{errors.confirm_password.message}</p>}
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
