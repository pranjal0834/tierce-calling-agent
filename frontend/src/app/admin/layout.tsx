"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, ShieldAlert, RefreshCw } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { VaaniqWave } from "@/components/VaaniqLogo";
import { getToken, clearToken } from "@/lib/auth";
import { api } from "@/lib/api";

const SIDEBAR_KEY = "vaaniq_admin_sidebar_collapsed";

// Browser-tab titles per admin route, keyed by exact path.
const ADMIN_PAGE_TITLES: Record<string, string> = {
  "/admin":                 "Overview",
  "/admin/workspaces":      "Workspaces",
  "/admin/users":           "Users",
  "/admin/agents":          "Agents",
  "/admin/calls":           "Calls",
  "/admin/scheduled-calls": "Scheduled Calls",
  "/admin/phone-numbers":   "Phone Numbers",
  "/admin/transactions":    "Transactions",
  "/admin/compliance":      "Compliance",
  "/admin/webhooks":        "Webhooks",
  "/admin/knowledge":       "Knowledge",
  "/admin/plans":           "Plans",
  "/admin/whatsapp":        "WhatsApp",
  "/admin/templates":       "Templates",
  "/admin/costs":           "Costs",
  "/admin/kyc":             "KYC Review",
  "/admin/workspaces/[id]": "Workspace Detail",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // "checking" | "ok" | "denied"
  const [auth, setAuth] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  // Keep the browser tab title in sync with the current admin page.
  useEffect(() => {
    const title = ADMIN_PAGE_TITLES[pathname]
      ?? Object.entries(ADMIN_PAGE_TITLES).find(([key]) => key !== "/admin" && pathname.startsWith(key))?.[1];
    document.title = title ? `${title} · Vaaniq Admin` : "Vaaniq Admin";
  }, [pathname]);

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
        <ShieldAlert className="w-12 h-12 text-red-400" />
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
        {/* Mobile top bar — dark, matching the admin sidebar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-brand-700 bg-brand-900 flex-shrink-0 z-30">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-brand-900 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center shadow-brand">
              <VaaniqWave className="icon-xs text-white" />
            </div>
            <span className="font-semibold text-[15px] text-white tracking-tight">Vaaniq</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 uppercase tracking-wider"><ShieldAlert className="w-3 h-3" /> Admin</span>
          </div>
        </header>

        {/* Amber accent bar reinforces that this is the sensitive admin console */}
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 flex-shrink-0" />

        <main className="relative flex-1 overflow-auto scroll-thin">
          {/* Subtle admin watermark */}
          <span aria-hidden className="pointer-events-none select-none fixed bottom-4 right-5 text-[64px] font-black tracking-tighter text-neutral-900/[0.035] leading-none z-0 hidden lg:block">
            ADMIN
          </span>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-brand-700 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500">Skip to content</a>
          <div id="main-content" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 page-enter space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
