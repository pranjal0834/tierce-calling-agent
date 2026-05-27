"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
      api.get<{ is_superadmin?: boolean }>("/auth/me")
        .then(r => { window.location.href = r.data?.is_superadmin ? "/admin" : "/"; })
        .catch(() => { window.location.href = "/"; });
    } else {
      router.replace("/login");
    }
  }, [params, router]);

  return null;
}

export default function CallbackPage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center animate-pulse">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <p className="text-gray-400 text-sm">Signing you in...</p>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
