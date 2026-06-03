"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot, Phone, BarChart3, Brain, Settings, Zap, LogOut,
  Wrench, CalendarClock, Hash, CreditCard, Webhook,
  ShieldCheck, Code2, ChevronLeft, ChevronRight, LayoutDashboard, X, BookOpen,
  LayoutTemplate,
} from "lucide-react";
import { logout } from "@/lib/auth";
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
      { href: "/memory",        icon: Brain,          label: "Memory"        },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/webhooks",    icon: Webhook,    label: "Webhooks"    },
      { href: "/tools",       icon: Wrench,     label: "Tools"       },
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

  useEffect(() => {
    api.get<{ is_superadmin?: boolean }>("/auth/me")
      .then(r => { if (r.data?.is_superadmin) setIsSuperAdmin(true); })
      .catch(() => {});
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { onMobileClose(); }, [pathname]);

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
        <button
          onClick={logout}
          title={!isMobile && collapsed ? "Sign out" : undefined}
          className={`group relative flex items-center gap-2.5 w-full rounded-lg text-[14px] font-medium text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-150 ${
            !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-2"
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(isMobile || !collapsed) && "Sign out"}
          {!isMobile && collapsed && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
              Sign out
            </span>
          )}
        </button>
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
