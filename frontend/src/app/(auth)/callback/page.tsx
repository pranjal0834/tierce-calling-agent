"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VaaniqWave } from "@/components/VaaniqLogo";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
      api.get<{ is_superadmin?: boolean }>("/auth/me")
        .then(r => { router.push(r.data?.is_superadmin ? "/admin" : "/"); })
        .catch(() => { setError("Authentication failed. Please try again."); });
    } else {
      router.replace("/login");
    }
  }, [params, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-error-600">{error}</p>
        <button onClick={() => router.push("/login")} className="text-sm text-brand-500 hover:underline">Back to login</button>
      </div>
    );
  }

  return null;
}

export default function CallbackPage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center animate-pulse">
        <VaaniqWave className="icon-lg text-white" />
      </div>
      <p className="text-neutral-400 text-sm">Signing you in...</p>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
