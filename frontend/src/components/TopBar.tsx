"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, CreditCard, Settings, LogOut, User as UserIcon, Search } from "lucide-react";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";

interface Me { email?: string; role?: string; is_superadmin?: boolean }

export default function TopBar({
  title,
  subtitle,
  onMobileMenu,
}: {
  title: string;
  subtitle?: string;
  onMobileMenu?: () => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Me>("/auth/me").then(r => setMe(r.data)).catch(() => {});
    api.get<{ credits_balance?: number }>("/billing/balance")
      .then(r => setCredits(r.data?.credits_balance ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const creditTone =
    credits === null ? { box: "bg-white border-neutral-200", icon: "text-neutral-400", text: "text-neutral-500" }
    : credits <= 0   ? { box: "bg-error-50 border-error-200 hover:border-error-300", icon: "text-error-500", text: "text-error-600" }
    : credits <= 5   ? { box: "bg-warning-50 border-warning-200 hover:border-warning-300", icon: "text-warning-500", text: "text-warning-600" }
    : { box: "bg-brand-50 border-brand-200 hover:border-brand-300", icon: "text-brand-500", text: "text-neutral-900" };

  const initial = (me?.email?.[0] || "?").toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 lg:px-8 bg-white/90 backdrop-blur-sm border-b border-neutral-200 flex-shrink-0">
      {/* Mobile menu */}
      <button
        onClick={onMobileMenu}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex-shrink-0"
        aria-label="Open menu"
      >
        <Menu className="icon-lg" />
      </button>

      {/* Title */}
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] sm:text-[19px] font-semibold text-neutral-900 tracking-tight leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-neutral-500 truncate hidden sm:block">{subtitle}</p>}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Command palette trigger */}
        <button
          onClick={() => window.dispatchEvent(new Event("vaaniq:command"))}
          className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600 transition-colors shadow-xs"
          title="Search (Ctrl/⌘ + K)"
        >
          <Search className="icon-sm" />
          <span className="text-sm">Search</span>
          <kbd className="text-[10px] font-medium bg-neutral-100 border border-neutral-200 rounded px-1 py-0.5">⌘K</kbd>
        </button>

        {/* Credits chip */}
        <Link
          href="/billing"
          className={`flex items-center gap-2 px-3 h-9 rounded-lg border transition-all shadow-xs ${creditTone.box}`}
          title="Call credits"
        >
          <CreditCard className={`icon-sm ${creditTone.icon}`} />
          <span className={`text-sm font-semibold ${creditTone.text}`}>
            {credits === null ? "—" : `${credits.toFixed(1)} min`}
          </span>
        </Link>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            title={me?.email || "Account"}
            className={`w-9 h-9 rounded-full bg-brand-500 text-white text-sm font-semibold flex items-center justify-center transition-shadow ${open ? "ring-2 ring-brand-500/30" : "hover:shadow-md"}`}
          >
            {initial}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-60 bg-white border border-neutral-200 rounded-xl shadow-modal py-1.5 z-50 animate-scale-in origin-top-right">
              <div className="px-3 py-2.5 border-b border-neutral-100">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">Account</p>
                <p className="text-sm font-medium text-neutral-900 truncate flex items-center gap-1.5">
                  <UserIcon className="icon-xs text-neutral-400" /> {me?.email || "—"}
                </p>
                {me?.role && <p className="text-[11px] text-neutral-400 mt-0.5 capitalize">{me.role}{me.is_superadmin ? " · super admin" : ""}</p>}
              </div>
              <MenuLink href="/settings" icon={Settings} label="Settings" onClick={() => setOpen(false)} />
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error-600 hover:bg-error-50 transition-colors"
              >
                <LogOut className="icon-sm" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 transition-colors">
      <Icon className="icon-sm text-neutral-400" /> {label}
    </Link>
  );
}
