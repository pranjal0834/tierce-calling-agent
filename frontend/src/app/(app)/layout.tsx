"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import TermsModal from "@/components/TermsModal";
import CommandPalette from "@/components/CommandPalette";
import { VaaniqWave } from "@/components/VaaniqLogo";
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
  const [needsTerms, setNeedsTerms] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const topbar = TOPBAR_PAGES[pathname] || Object.entries(TOPBAR_PAGES).find(([key]) => key !== "/" && pathname.startsWith(key))?.[1];

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  // Keep the browser tab title in sync with the current page.
  useEffect(() => {
    document.title = topbar?.title ? `${topbar.title} · Vaaniq` : "Vaaniq Voice Agent";
  }, [topbar?.title]);

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
    api.get<{ is_superadmin?: boolean; needs_terms_acceptance?: boolean }>("/auth/me")
      .then(r => {
        // Super admins may browse the user app (e.g. via "Back to app"), but we
        // surface a persistent banner so it's always clear they're outside the
        // admin console. Login routes them to /admin by default.
        if (r.data?.is_superadmin) setIsSuperAdmin(true);
        if (r.data?.needs_terms_acceptance) setNeedsTerms(true);
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
      {needsTerms && <div role="alert"><TermsModal onAccepted={() => setNeedsTerms(false)} /></div>}
      <CommandPalette />
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* A super admin is browsing the user-facing app — keep it unmistakable. */}
        {isSuperAdmin && (
          <div role="status" className="flex items-center justify-between gap-3 px-4 sm:px-6 h-9 bg-amber-500 text-neutral-900 flex-shrink-0 z-40">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide truncate">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Super Admin Viewing — you're browsing the user app
            </span>
            <a href="/admin" className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80 whitespace-nowrap shrink-0">
              Return to Admin Console →
            </a>
          </div>
        )}
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
                <VaaniqWave className="icon-xs text-white" />
              </div>
              <span className="font-semibold text-[15px] text-neutral-900 tracking-tight">Vaaniq</span>
            </div>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto scroll-thin">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-brand-700 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500">Skip to content</a>
          <div id="main-content" className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
