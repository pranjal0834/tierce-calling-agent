"use client";
import { useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import toast from "react-hot-toast";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function RegisterPage() {
  const [form, setForm] = useState({
    workspace_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workspace_name || !form.email || !form.password) {
      toast.error("All fields are required");
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        workspace_name: form.workspace_name,
        email: form.email,
        password: form.password,
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
          <Zap className="w-4.5 h-4.5 text-white" />
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-base">Workspace Name</label>
            <input
              className="input-base"
              placeholder="Acme Inc."
              value={form.workspace_name}
              onChange={e => setForm(f => ({ ...f, workspace_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-base">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="input-base"
              placeholder="you@company.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-base">Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input-base"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-base">Confirm Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input-base"
              placeholder="••••••••"
              value={form.confirm_password}
              onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
            />
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
