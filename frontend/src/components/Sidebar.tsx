"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Phone, BarChart3, Brain, Settings, Zap, LogOut, Wrench, CalendarClock, Hash, CreditCard, Webhook, ShieldCheck, Code2 } from "lucide-react";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { href: "/",       icon: BarChart3,     label: "Dashboard" },
      { href: "/agents", icon: Bot,           label: "Agents"    },
      { href: "/calls",  icon: Phone,         label: "Calls"     },
    ],
  },
  {
    label: "Features",
    items: [
      { href: "/phone-numbers", icon: Hash,          label: "Phone Numbers" },
      { href: "/scheduling",    icon: CalendarClock, label: "Scheduling"    },
      { href: "/analytics",     icon: BarChart3,     label: "Analytics"     },
      { href: "/memory",        icon: Brain,         label: "Memory"        },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/webhooks",   icon: Webhook,    label: "Webhooks"   },
      { href: "/tools",      icon: Wrench,     label: "Tools"      },
      { href: "/developers", icon: Code2,      label: "Developers" },
      { href: "/billing",    icon: CreditCard, label: "Billing"    },
      { href: "/settings",   icon: Settings,   label: "Settings"   },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    api.get<{ is_superadmin?: boolean }>("/auth/me").then(r => {
      if (r.data?.is_superadmin) setIsSuperAdmin(true);
    }).catch(() => {});
  }, []);

  return (
    <aside className="w-56 bg-white border-r border-neutral-200 flex flex-col">
      {/* Brand header */}
      <div className="px-5 py-5 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center shadow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-neutral-900 text-base leading-none">Tierce</span>
            <p className="text-[10px] text-neutral-400 mt-0.5">Voice Agent Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto sidebar-nav">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <div className="h-px bg-neutral-200 mb-3" />}
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-50 text-brand-600"
                        : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-brand-500" : ""}`} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-neutral-200 pt-3 space-y-0.5">
        {isSuperAdmin && (
          <Link
            href="/admin"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Super Admin
          </Link>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
        <p className="text-[10px] text-neutral-400 px-3 pt-1">Tierce Voice v1.0</p>
      </div>
    </aside>
  );
}
