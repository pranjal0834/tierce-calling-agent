"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot, Phone, BarChart3, Settings, Zap,
  CalendarClock, Hash, CreditCard, Webhook,
  ShieldCheck, Code2, ChevronLeft, ChevronRight, LayoutDashboard, X, BookOpen,
  LayoutTemplate, FileCheck, Wallet, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { href: "/",             icon: LayoutDashboard, label: "Dashboard"     },
      { href: "/agents",       icon: Bot,             label: "Agents"        },
      { href: "/templates",    icon: LayoutTemplate,  label: "Templates"     },
      { href: "/calls",        icon: Phone,           label: "Calls"         },
    ],
  },
  {
    label: "Features",
    items: [
      { href: "/phone-numbers", icon: Hash,           label: "Phone Numbers" },
      { href: "/scheduling",    icon: CalendarClock,  label: "Scheduling"    },
      { href: "/knowledge",     icon: BookOpen,       label: "Knowledge Base"},
      { href: "/analytics",     icon: BarChart3,      label: "Analytics"     },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/compliance",  icon: ShieldCheck, label: "Compliance" },
      { href: "/webhooks",    icon: Webhook,    label: "Webhooks"    },
      { href: "/developers",  icon: Code2,      label: "Developers"  },
      { href: "/billing",     icon: CreditCard, label: "Billing"     },
      { href: "/settings",    icon: Settings,   label: "Settings"    },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [kycPending, setKycPending] = useState(0);
  const [billing, setBilling] = useState<{
    walletBalance: number; price: number; numberCount: number;
    creditsBalance: number; creditsUsedPct: number; creditsTotal: number;
  } | null>(null);

  useEffect(() => {
    api.get<{ is_superadmin?: boolean }>("/auth/me")
      .then(r => {
        if (r.data?.is_superadmin) {
          setIsSuperAdmin(true);
          api.get<{ count: number }>("/api/kyc/admin/pending-count")
            .then(c => setKycPending(c.data?.count || 0)).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Refresh the wallet + credits indicators on every route change (e.g. after a top-up/usage).
  useEffect(() => {
    api.get<{
      number_balance_inr?: number; number_price_inr?: number; phone_number_count?: number;
      credits_balance?: number; credits_used_pct?: number; credits_total_minutes?: number;
    }>("/billing/balance")
      .then(r => setBilling({
        walletBalance: r.data?.number_balance_inr ?? 0,
        price: r.data?.number_price_inr ?? 250,
        numberCount: r.data?.phone_number_count ?? 0,
        creditsBalance: r.data?.credits_balance ?? 0,
        creditsUsedPct: r.data?.credits_used_pct ?? 0,
        creditsTotal: r.data?.credits_total_minutes ?? 0,
      }))
      .catch(() => {});
  }, [pathname]);

  // Close mobile drawer on route change
  useEffect(() => { onMobileClose(); }, [pathname]);

  // Wallet shown only once the workspace owns numbers; "low" = can't cover next renewal of all numbers.
  const showWallet = !!billing && billing.numberCount > 0;
  const walletLow = !!billing && billing.walletBalance < billing.price * Math.max(1, billing.numberCount);
  const walletMonths = billing && billing.price > 0 ? Math.floor(billing.walletBalance / billing.price) : 0;

  // Call-credits gauge: show once the workspace has ever had credits.
  const showCredits = !!billing && billing.creditsTotal > 0;
  const creditsUsed = billing?.creditsUsedPct ?? 0;
  const creditsRemainingPct = Math.max(0, 100 - creditsUsed);
  const creditsCritical = creditsRemainingPct <= 10;   // ≤10% left → red
  const creditsWarn = creditsRemainingPct <= 30;        // ≤30% left → amber (incl. critical)
  const creditsColor = creditsCritical ? "bg-red-500" : creditsWarn ? "bg-amber-500" : "bg-brand-500";
  const creditsTextColor = creditsCritical ? "text-red-600" : creditsWarn ? "text-amber-700" : "text-neutral-700";
  const creditsBox = creditsCritical
    ? "bg-red-50 border-red-200 hover:bg-red-100"
    : creditsWarn
      ? "bg-amber-50 border-amber-200 hover:bg-amber-100"
      : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100";
  const creditsLabelColor = creditsCritical ? "text-red-700" : creditsWarn ? "text-amber-700" : "text-neutral-600";

  const sidebarContent = (isMobile = false) => (
    <>
      {/* Brand header */}
      <div className={`flex items-center border-b border-neutral-200 h-14 flex-shrink-0 ${
        !isMobile && collapsed ? "justify-center px-0" : "px-5 gap-3"
      }`}>
        <div className="w-8 h-8 bg-brand-500 rounded-[10px] flex items-center justify-center shadow-brand flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {(isMobile || !collapsed) && (
          <div className="min-w-0 flex-1 animate-fade-in">
            <p className="font-semibold text-neutral-900 text-[15px] leading-none tracking-tight">Vaaniq</p>
            <p className="text-[11px] text-neutral-400 mt-0.5 leading-none">Voice Platform</p>
          </div>
        )}
        {/* Mobile close button */}
        {isMobile && (
          <button
            onClick={onMobileClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors ml-auto flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto sidebar-nav">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <div className="h-px bg-neutral-100 mb-3 mx-1" />}
            {(isMobile || !collapsed) && (
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    title={!isMobile && collapsed ? label : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium transition-all duration-150 ${
                      !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-3 py-2"
                    } ${
                      active
                        ? "bg-brand-50 text-brand-600"
                        : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                    }`}
                  >
                    {active && (isMobile || !collapsed) && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-500 rounded-full" />
                    )}
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                      active ? "text-brand-500" : "text-neutral-400 group-hover:text-neutral-600"
                    }`} />
                    {(isMobile || !collapsed) && <span className="truncate">{label}</span>}
                    {!isMobile && collapsed && (
                      <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                        {label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-neutral-100 pt-2 pb-3 space-y-0.5 ${
        !isMobile && collapsed ? "px-1.5" : "px-3"
      }`}>
        {/* Call-credits usage gauge */}
        {showCredits && (
          (isMobile || !collapsed) ? (
            <Link href="/billing" className={`group block rounded-lg px-2.5 py-2 mb-1 border transition-colors ${creditsBox}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[12px] font-medium ${creditsLabelColor}`}>
                  <CreditCard className="w-3.5 h-3.5" /> Call Credits
                </span>
                <span className={`text-[13px] font-semibold ${creditsTextColor}`}>{creditsUsed}% used</span>
              </div>
              <div className={`mt-1.5 h-1.5 w-full rounded-full overflow-hidden ${creditsWarn ? "bg-white/60" : "bg-neutral-200"}`}>
                <div className={`h-full ${creditsColor} rounded-full transition-all`} style={{ width: `${creditsRemainingPct}%` }} />
              </div>
              <p className={`text-[11px] mt-1 flex items-center gap-1 ${creditsWarn ? creditsTextColor : "text-neutral-400"}`}>
                {creditsWarn
                  ? <><AlertTriangle className="w-3 h-3" /> {billing!.creditsBalance.toFixed(0)} min left — tap to top up</>
                  : `${billing!.creditsBalance.toFixed(0)} min left`}
              </p>
            </Link>
          ) : (
            <Link
              href="/billing"
              title={`Call credits: ${creditsUsed}% used · ${billing!.creditsBalance.toFixed(0)} min left`}
              className={`group relative flex items-center justify-center h-9 w-9 mx-auto rounded-lg border transition-colors mb-1 ${creditsBox}`}
            >
              <CreditCard className={`w-4 h-4 ${creditsWarn ? creditsTextColor : "text-neutral-500"}`} />
              {creditsWarn && <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white ${creditsCritical ? "bg-red-500" : "bg-amber-500"}`} />}
              <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                Credits {creditsUsed}% used · {billing!.creditsBalance.toFixed(0)} min{creditsWarn ? " · top up" : ""}
              </span>
            </Link>
          )
        )}
        {/* Number wallet indicator */}
        {showWallet && (
          (isMobile || !collapsed) ? (
            <Link
              href="/phone-numbers"
              className={`group block rounded-lg px-2.5 py-2 mb-1 border transition-colors ${
                walletLow
                  ? "bg-amber-50 border-amber-200 hover:bg-amber-100"
                  : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[12px] font-medium ${walletLow ? "text-amber-700" : "text-neutral-600"}`}>
                  <Wallet className="w-3.5 h-3.5" /> Number Wallet
                </span>
                <span className={`text-[13px] font-semibold ${walletLow ? "text-amber-700" : "text-neutral-800"}`}>
                  ₹{billing!.walletBalance.toFixed(0)}
                </span>
              </div>
              <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${walletLow ? "text-amber-600" : "text-neutral-400"}`}>
                {walletLow
                  ? <><AlertTriangle className="w-3 h-3" /> Low balance — tap to top up</>
                  : `≈ ${walletMonths} renewal${walletMonths === 1 ? "" : "s"} left`}
              </p>
            </Link>
          ) : (
            <Link
              href="/phone-numbers"
              title={`Number wallet: ₹${billing!.walletBalance.toFixed(0)}${walletLow ? " (low)" : ""}`}
              className={`group relative flex items-center justify-center h-9 w-9 mx-auto rounded-lg border transition-colors mb-1 ${
                walletLow ? "bg-amber-50 border-amber-200" : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100"
              }`}
            >
              <Wallet className={`w-4 h-4 ${walletLow ? "text-amber-600" : "text-neutral-500"}`} />
              {walletLow && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />}
              <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                Wallet ₹{billing!.walletBalance.toFixed(0)}{walletLow ? " · low" : ""}
              </span>
            </Link>
          )
        )}
        {isSuperAdmin && (
          <Link
            href="/admin"
            title={!isMobile && collapsed ? "Super Admin" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium text-brand-600 hover:bg-brand-50 transition-colors duration-150 ${
              !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-2"
            }`}
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            {(isMobile || !collapsed) && "Super Admin"}
            {!isMobile && collapsed && (
              <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                Super Admin
              </span>
            )}
          </Link>
        )}
        {isSuperAdmin && (
          <Link
            href="/admin/kyc"
            title={!isMobile && collapsed ? "KYC Review" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium text-brand-600 hover:bg-brand-50 transition-colors duration-150 ${
              !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-2"
            }`}
          >
            <FileCheck className="w-4 h-4 flex-shrink-0" />
            {(isMobile || !collapsed) && <span className="flex-1">KYC Review</span>}
            {(isMobile || !collapsed) && kycPending > 0 && (
              <span className="text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                {kycPending}
              </span>
            )}
            {!isMobile && collapsed && kycPending > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
            )}
            {!isMobile && collapsed && (
              <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                KYC Review{kycPending > 0 ? ` (${kycPending})` : ""}
              </span>
            )}
          </Link>
        )}
        {(isMobile || !collapsed) && (
          <p className="text-[11px] text-neutral-300 px-3 pt-1">v1.0</p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile overlay backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-neutral-200
          w-[260px] transition-transform duration-300 ease-in-out
          lg:hidden
          ${mobileOpen ? "translate-x-0 shadow-modal" : "-translate-x-full"}
        `}
      >
        {sidebarContent(true)}
      </aside>

      {/* ── Desktop sidebar (unchanged) ── */}
      <aside
        className={`
          relative hidden lg:flex flex-col bg-white border-r border-neutral-200
          transition-all duration-250 ease-in-out flex-shrink-0
          ${collapsed ? "w-[60px]" : "w-[260px]"}
        `}
      >
        {sidebarContent(false)}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[52px] w-6 h-6 bg-white border border-neutral-200 rounded-full flex items-center justify-center shadow-sm hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-md transition-all duration-150 z-10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-neutral-500" />
            : <ChevronLeft  className="w-3 h-3 text-neutral-500" />}
        </button>
      </aside>
    </>
  );
}
