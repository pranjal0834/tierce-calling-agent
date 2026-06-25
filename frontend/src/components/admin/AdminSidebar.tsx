"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, Users, Phone, DollarSign, FileCheck,
  ShieldCheck, Zap, LogOut, ArrowLeft, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";

const NAV = [
  { href: "/admin",            icon: LayoutDashboard, label: "Overview"    },
  { href: "/admin/workspaces", icon: Building2,       label: "Workspaces"  },
  { href: "/admin/users",      icon: Users,           label: "Users"       },
  { href: "/admin/calls",      icon: Phone,           label: "Calls"       },
  { href: "/admin/costs",      icon: DollarSign,      label: "Costs"       },
  { href: "/admin/kyc",        icon: FileCheck,       label: "KYC Review", badge: true },
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

  useEffect(() => {
    api.get<{ count: number }>("/api/kyc/admin/pending-count")
      .then(c => setKycPending(c.data?.count || 0)).catch(() => {});
  }, [pathname]);

  useEffect(() => { onMobileClose(); }, [pathname]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

  const content = (isMobile = false) => (
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
            <p className="text-[11px] text-brand-500 mt-1 leading-none flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Super Admin
            </p>
          </div>
        )}
        {isMobile && (
          <button onClick={onMobileClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors ml-auto flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto sidebar-nav">
        {(isMobile || !collapsed) && (
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-3 mb-1.5">Platform</p>
        )}
        {NAV.map(({ href, icon: Icon, label, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={!isMobile && collapsed ? label : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium transition-all duration-150 ${
                !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-3 py-2"
              } ${active ? "bg-brand-50 text-brand-600" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"}`}
            >
              {active && (isMobile || !collapsed) && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-500 rounded-full" />
              )}
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? "text-brand-500" : "text-neutral-400 group-hover:text-neutral-600"}`} />
              {(isMobile || !collapsed) && <span className="truncate flex-1">{label}</span>}
              {/* Badge (expanded) */}
              {badge && kycPending > 0 && (isMobile || !collapsed) && (
                <span className="text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-red-500 text-white">{kycPending}</span>
              )}
              {/* Badge dot (collapsed) */}
              {badge && kycPending > 0 && !isMobile && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
              {/* Tooltip (collapsed) */}
              {!isMobile && collapsed && (
                <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                  {label}{badge && kycPending > 0 ? ` (${kycPending})` : ""}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`border-t border-neutral-100 pt-2 pb-3 space-y-0.5 ${!isMobile && collapsed ? "px-1.5" : "px-3"}`}>
        <Link
          href="/"
          title={!isMobile && collapsed ? "Back to app" : undefined}
          className={`group relative flex items-center gap-2.5 rounded-lg text-[14px] font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors duration-150 ${
            !isMobile && collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-2"
          }`}
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          {(isMobile || !collapsed) && "Back to app"}
          {!isMobile && collapsed && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">Back to app</span>
          )}
        </Link>
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
            <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">Sign out</span>
          )}
        </button>
        {(isMobile || !collapsed) && <p className="text-[11px] text-neutral-300 px-3 pt-1">v1.0</p>}
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
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-neutral-200 w-[260px] transition-transform duration-300 ease-in-out lg:hidden ${mobileOpen ? "translate-x-0 shadow-modal" : "-translate-x-full"}`}>
        {content(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside className={`relative hidden lg:flex flex-col bg-white border-r border-neutral-200 transition-all duration-250 ease-in-out flex-shrink-0 ${collapsed ? "w-[60px]" : "w-[260px]"}`}>
        {content(false)}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[52px] w-6 h-6 bg-white border border-neutral-200 rounded-full flex items-center justify-center shadow-sm hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-md transition-all duration-150 z-10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-3 h-3 text-neutral-500" /> : <ChevronLeft className="w-3 h-3 text-neutral-500" />}
        </button>
      </aside>
    </>
  );
}
