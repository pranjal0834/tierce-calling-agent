"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, Zap } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { getToken, clearToken } from "@/lib/auth";
import { api } from "@/lib/api";

// Pages that have the new top navigation bar, keyed by exact route.
const TOPBAR_PAGES: Record<string, { title: string; subtitle?: string }> = {
  "/":              { title: "Dashboard",       subtitle: "Real-time overview of your voice agent platform" },
  "/agents":        { title: "Agents",          subtitle: "Configure and manage your voice AI agents" },
  "/templates":     { title: "Agent Templates", subtitle: "Jumpstart your setup with preconfigured voice agents" },
  "/calls":         { title: "Calls",           subtitle: "Monitor and review all call sessions" },
  "/phone-numbers": { title: "Phone Numbers",   subtitle: "Dedicated numbers for inbound calls and branded caller ID" },
  "/scheduling":    { title: "Call Scheduling", subtitle: "Schedule outbound calls for a future date and time" },
  "/knowledge":     { title: "Knowledge Base",  subtitle: "Documents your agents can reference during live calls" },
  "/analytics":     { title: "Analytics",       subtitle: "Performance metrics, sentiment trends, and quality scores" },
  "/compliance":    { title: "Compliance",      subtitle: "Consent, DNC suppression, calling hours, and call-health monitoring" },
  "/webhooks":      { title: "Webhooks",        subtitle: "Notify your systems when calls happen — CRMs, Zapier, and more" },
  "/developers":    { title: "Developers",      subtitle: "Automate calls and integrate with the Vaaniq API" },
  "/billing":       { title: "Billing",         subtitle: "Manage your credits, plans, and transaction history" },
  "/settings":      { title: "Settings",        subtitle: "Manage your workspace, team, and account preferences" },
};

const SIDEBAR_KEY = "vaaniq_sidebar_collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const topbar = TOPBAR_PAGES[pathname];

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
      .then(r => {
        if (r.data?.is_superadmin) window.location.href = "/admin";
      })
      .catch((err: { response?: { status?: number } }) => {
        if (!err.response || err.response.status === 401 || err.response.status === 403) {
          clearToken();
          router.replace("/login");
        }
      });
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {topbar ? (
          /* Full top navigation bar (desktop + mobile) */
          <TopBar title={topbar.title} subtitle={topbar.subtitle} onMobileMenu={() => setMobileMenuOpen(true)} />
        ) : (
          /* Mobile top bar — hidden on lg+ */
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
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-[15px] text-neutral-900 tracking-tight">Vaaniq</span>
            </div>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto scroll-thin">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
