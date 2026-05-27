"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Phone, BarChart3, Brain, Settings, Zap, LogOut, Wrench, CalendarClock, Hash, CreditCard, Webhook, ShieldCheck, Code2 } from "lucide-react";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";

const nav = [
  { href: "/",              icon: BarChart3,    label: "Dashboard"     },
  { href: "/agents",        icon: Bot,          label: "Agents"        },
  { href: "/calls",         icon: Phone,        label: "Calls"         },
  { href: "/analytics",     icon: Zap,          label: "Analytics"     },
  { href: "/memory",        icon: Brain,        label: "Memory"        },
  { href: "/tools",         icon: Wrench,       label: "Tools"         },
  { href: "/scheduling",    icon: CalendarClock, label: "Scheduling"   },
  { href: "/phone-numbers", icon: Hash,         label: "Phone Numbers" },
  { href: "/billing",       icon: CreditCard,   label: "Billing"       },
  { href: "/webhooks",      icon: Webhook,      label: "Webhooks"      },
  { href: "/developers",    icon: Code2,        label: "Developers"    },
  { href: "/settings",      icon: Settings,     label: "Settings"      },
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
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-6">
      <div className="px-5 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg">Tierce</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">Voice Agent Platform</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? "bg-brand-500/20 text-brand-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pt-4 border-t border-gray-800 space-y-1">
        {isSuperAdmin && (
          <Link
            href="/admin"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Super Admin
          </Link>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
        <p className="text-xs text-gray-600 px-3">Tierce Voice Agent v1.0</p>
      </div>
    </aside>
  );
}
