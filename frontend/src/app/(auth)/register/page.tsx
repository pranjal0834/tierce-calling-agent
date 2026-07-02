"use client";
import { useState } from "react";
import Link from "next/link";
import { VaaniqWave } from "@/components/VaaniqLogo";
import toast from "react-hot-toast";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";
import PasswordInput from "@/components/ui/PasswordInput";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InputField } from "@/components/ui/FormField";

const schema = z.object({
  workspace_name: z.string().min(1, "Workspace name is required"),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string().min(1, "Please confirm your password"),
}).refine(d => d.password === d.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

type FormValues = z.infer<typeof schema>;

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        workspace_name: data.workspace_name,
        email: data.email,
        password: data.password,
      });
      setToken(res.data.access_token);
      toast.success("Workspace created!");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  const handleGoogle = () => {
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/google?origin=${origin}`;
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
        <div className="mb-7">
          <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">Create your workspace</h1>
          <p className="text-sm text-neutral-500 mt-1">Start your AI voice calling platform in seconds</p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2.5 h-10 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-all duration-150 shadow-xs mb-5"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-neutral-100" />
          <span className="text-xs text-neutral-400">or continue with email</span>
          <div className="flex-1 h-px bg-neutral-100" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <InputField
            label="Workspace Name"
            id="workspace_name"
            registration={register("workspace_name")}
            error={errors.workspace_name}
            placeholder="Acme Inc."
          />
          <InputField
            label="Email"
            id="email"
            registration={register("email")}
            error={errors.email}
            type="email"
            placeholder="you@company.com"
          />
          <div>
            <label htmlFor="register-password" className="label-base">Password</label>
            <PasswordInput
              id="register-password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={watch("password")}
              onChange={e => setValue("password", e.target.value)}
            />
            {errors.password && <p className="text-xs text-error-600 mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="register-confirm-password" className="label-base">Confirm Password</label>
            <PasswordInput
              id="register-confirm-password"
              autoComplete="new-password"
              value={watch("confirm_password")}
              onChange={e => setValue("confirm_password", e.target.value)}
            />
            {errors.confirm_password && <p className="text-xs text-error-600 mt-1">{errors.confirm_password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-xs hover:shadow-brand/20 active:scale-[0.99] mt-1"
          >
            {loading ? "Creating workspace…" : "Create Workspace"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-neutral-500 mt-5">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700 transition-colors">
          Sign in
        </Link>
      </p>
    </>
  );
}
