"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, Users, Phone, DollarSign, FileCheck,
  ShieldCheck, ShieldAlert, LogOut, ArrowLeft, ChevronLeft, ChevronRight, X,
  Hash, ArrowLeftRight, Bot, CalendarClock, Webhook,
  LayoutTemplate, MessageCircle, BookOpen, ChevronDown, CreditCard,
} from "lucide-react";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";
import { VaaniqWave } from "@/components/VaaniqLogo";

const NAV = [
  { href: "/admin",                icon: LayoutDashboard, label: "Overview"     },
  { href: "/admin/workspaces",     icon: Building2,       label: "Workspaces"   },
  { href: "/admin/users",          icon: Users,           label: "Users"        },
  { href: "/admin/agents",         icon: Bot,             label: "Agents"       },
  { href: "/admin/calls",          icon: Phone,           label: "Calls"        },
  { href: "/admin/scheduled-calls",icon: CalendarClock,   label: "Scheduled"    },
  { href: "/admin/phone-numbers",  icon: Hash,            label: "Numbers"      },
  { href: "/admin/transactions",   icon: ArrowLeftRight,  label: "Transactions" },
  { href: "/admin/compliance",     icon: ShieldCheck,     label: "Compliance"   },
  { href: "/admin/webhooks",       icon: Webhook,         label: "Webhooks"     },
  { href: "/admin/knowledge",      icon: BookOpen,        label: "Knowledge"    },
  { href: "/admin/plans",          icon: CreditCard,      label: "Plans"        },
  { href: "/admin/whatsapp",       icon: MessageCircle,   label: "WhatsApp"     },
  { href: "/admin/templates",      icon: LayoutTemplate,  label: "Templates"    },
  { href: "/admin/costs",          icon: DollarSign,      label: "Costs"        },
  { href: "/admin/kyc",            icon: FileCheck,       label: "KYC Review", badge: true },
];

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const [kycPending, setKycPending] = useState(0);
  const [recentWorkspaces, setRecentWorkspaces] = useState<{id: string; name: string}[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);

  useEffect(() => {
    api.get<{ count: number }>("/api/kyc/admin/pending-count")
      .then(c => setKycPending(c.data?.count || 0)).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    api.get<any>("/api/admin/workspaces")
      .then(r => setRecentWorkspaces((r.data.items ?? []).slice(0, 5).map((w: any) => ({ id: w.id, name: w.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => { onMobileClose(); }, [pathname]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

  const content = (isMobile = false) => (
    <>
      {/* Brand header */}
      <div className={`flex items-center border-b border-brand-700 h-14 flex-shrink-0 ${
        !isMobile && collapsed ? "justify-center px-0" : "px-5 gap-3"
      }`}>
        <div className="w-8 h-8 bg-brand-500 rounded-[10px] flex items-center justify-center shadow-brand flex-shrink-0">
          <VaaniqWave className="icon-sm text-white" />
        </div>
        {(isMobile || !collapsed) && (
          <div className="min-w-0 flex-1 animate-fade-in">
            <p className="font-semibold text-white text-[15px] leading-none tracking-tight">Vaaniq</p>
            <p className="text-[11px] text-amber-400 mt-1 leading-none flex items-center gap-1 font-semibold uppercase tracking-wider">
              <ShieldAlert className="icon-xs" /> Super Admin
            </p>
          </div>
        )}
        {isMobile && (
          <button onClick={onMobileClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-brand-800 transition-colors ml-auto flex-shrink-0">
            <X className="icon-sm" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Admin navigation" className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto sidebar-nav">
        {(isMobile || !collapsed) && (
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest px-3 mb-1.5">Platform</p>
        )}
        {NAV.map(({ href, icon: Icon, label, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={!isMobile && collapsed ? label : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium transition-all duration-150 ${
                !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-3 py-2"
              } ${active ? "bg-amber-500/15 text-amber-300" : "text-neutral-400 hover:text-white hover:bg-brand-800"}`}
            >
              {active && (isMobile || !collapsed) && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-400 rounded-full" />
              )}
              <Icon className={`icon-md flex-shrink-0 transition-colors ${active ? "text-amber-400" : "text-neutral-500 group-hover:text-neutral-300"}`} />
              {(isMobile || !collapsed) && <span className="truncate flex-1">{label}</span>}
              {/* Badge (expanded) */}
              {badge && kycPending > 0 && (isMobile || !collapsed) && (
                <span aria-live="polite" aria-atomic="true" className="text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-error-500 text-white">{kycPending}</span>
              )}
              {/* Badge dot (collapsed) */}
              {badge && kycPending > 0 && !isMobile && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error-500 ring-2 ring-brand-800" />
              )}
              {/* Tooltip (collapsed) */}
              {!isMobile && collapsed && (
                <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-brand-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg border border-brand-600">
                  {label}{badge && kycPending > 0 ? ` (${kycPending})` : ""}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`relative border-t border-brand-700 pt-2 pb-3 space-y-0.5 ${!isMobile && collapsed ? "px-1.5" : "px-3"}`}>
        {/* Subtle "ADMIN" watermark */}
        {(isMobile || !collapsed) && (
          <span aria-hidden className="pointer-events-none select-none absolute right-3 -top-1 text-[40px] font-black tracking-tighter text-white/[0.03] leading-none">
            ADMIN
          </span>
        )}
        <Link
          href="/"
          title={!isMobile && collapsed ? "Back to app" : undefined}
          className={`group relative flex items-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
            !isMobile && collapsed
              ? "justify-center h-9 w-9 mx-auto bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "w-full justify-center h-9 bg-amber-500 hover:bg-amber-400 text-white shadow-sm"
          }`}
        >
          <ArrowLeft className={`flex-shrink-0 ${!isMobile && collapsed ? "icon-sm" : "w-4 h-4"}`} />
          {(isMobile || !collapsed) && "Back to app"}
          {!isMobile && collapsed && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-amber-500 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg border border-amber-400">
              Back to app
            </span>
          )}
        </Link>
        {(isMobile || !collapsed) && recentWorkspaces.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setRecentOpen(o => !o)}
              className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-400 hover:text-white hover:bg-brand-800 transition-colors"
            >
              <Building2 className="icon-xs flex-shrink-0" />
              <span className="truncate flex-1 text-left">Recent Workspaces</span>
              <ChevronDown className={`icon-xs transition-transform ${recentOpen ? "rotate-180" : ""}`} />
            </button>
            {recentOpen && (
              <div className="bg-brand-800 border border-brand-600 rounded-lg py-1 mb-1">
                {recentWorkspaces.map(ws => (
                  <Link
                    key={ws.id}
                    href={`/admin/workspaces/${ws.id}`}
                    onClick={() => setRecentOpen(false)}
                    className="block px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-brand-800 transition-colors truncate"
                  >
                    {ws.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={logout}
          title={!isMobile && collapsed ? "Sign out" : undefined}
          className={`group relative flex items-center gap-2.5 w-full rounded-lg text-[14px] font-medium text-neutral-400 hover:text-error-400 hover:bg-error-500/10 transition-colors duration-150 ${
            !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-2"
          }`}
        >
          <LogOut className="icon-sm flex-shrink-0" />
          {(isMobile || !collapsed) && "Sign out"}
          {!isMobile && collapsed && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-brand-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg border border-brand-600">Sign out</span>
          )}
        </button>
        {(isMobile || !collapsed) && <p className="text-[11px] text-neutral-600 px-3 pt-1">v1.0</p>}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden" onClick={onMobileClose} />
      )}

      {/* Mobile drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-brand-900 border-r border-brand-700 w-[260px] max-w-[80%] transition-transform duration-300 ease-in-out lg:hidden ${mobileOpen ? "translate-x-0 shadow-modal" : "-translate-x-full"}`}>
        {content(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside className={`relative hidden lg:flex flex-col bg-brand-900 border-r border-brand-700 transition-all duration-250 ease-in-out flex-shrink-0 ${collapsed ? "w-[60px]" : "w-[260px]"}`}>
        {content(false)}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[52px] w-6 h-6 bg-brand-900 border border-brand-700 rounded-full flex items-center justify-center shadow-sm hover:bg-brand-700 hover:border-brand-600 transition-all duration-150 z-10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="icon-xs text-neutral-300" /> : <ChevronLeft className="icon-xs text-neutral-300" />}
        </button>
      </aside>
    </>
  );
}
