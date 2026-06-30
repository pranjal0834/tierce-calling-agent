"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, ShieldCheck, RefreshCw } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { VaaniqWave } from "@/components/VaaniqLogo";
import { getToken, clearToken } from "@/lib/auth";
import { api } from "@/lib/api";

const SIDEBAR_KEY = "vaaniq_admin_sidebar_collapsed";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // "checking" | "ok" | "denied"
  const [auth, setAuth] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api.get<{ is_superadmin?: boolean }>("/auth/me")
      .then(r => setAuth(r.data?.is_superadmin ? "ok" : "denied"))
      .catch((err: { response?: { status?: number } }) => {
        if (!err.response || err.response.status === 401 || err.response.status === 403) {
          clearToken();
          router.replace("/login");
        } else {
          setAuth("denied");
        }
      });
  }, [router]);

  if (auth === "checking") {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <RefreshCw className="w-6 h-6 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (auth === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-50 gap-4 px-6 text-center">
        <ShieldCheck className="w-12 h-12 text-red-400" />
        <p className="text-neutral-900 text-lg font-semibold">Super admin access required</p>
        <p className="text-neutral-600 text-sm">Your account is not in the ADMIN_EMAILS list.</p>
        <a href="/" className="mt-2 inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors">← Back to app</a>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <AdminSidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-neutral-200 bg-white flex-shrink-0 z-30">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center shadow-brand">
              <VaaniqWave className="icon-xs text-white" />
            </div>
            <span className="font-semibold text-[15px] text-neutral-900 tracking-tight">Vaaniq</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600"><ShieldCheck className="w-3 h-3" /> Admin</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto scroll-thin">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 page-enter space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
