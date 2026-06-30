"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard, Bot, LayoutTemplate, Phone, Hash, CalendarClock, BookOpen,
  BarChart3, ShieldCheck, Webhook, Code2, CreditCard, Settings, FileText,
  Plus, PhoneOutgoing, Search,
} from "lucide-react";

const PAGES = [
  { label: "Dashboard",      href: "/",              icon: LayoutDashboard, kw: "home overview" },
  { label: "Agents",         href: "/agents",        icon: Bot,             kw: "voice ai" },
  { label: "Templates",      href: "/templates",     icon: LayoutTemplate,  kw: "" },
  { label: "Calls",          href: "/calls",         icon: Phone,           kw: "history recordings" },
  { label: "Phone Numbers",  href: "/phone-numbers", icon: Hash,            kw: "did inbound buy" },
  { label: "Scheduling",     href: "/scheduling",    icon: CalendarClock,   kw: "schedule callback" },
  { label: "Knowledge Base", href: "/knowledge",     icon: BookOpen,        kw: "rag documents" },
  { label: "Analytics",      href: "/analytics",     icon: BarChart3,       kw: "metrics" },
  { label: "Compliance",     href: "/compliance",    icon: ShieldCheck,     kw: "dnc consent" },
  { label: "Webhooks",       href: "/webhooks",      icon: Webhook,         kw: "events" },
  { label: "Developers",     href: "/developers",    icon: Code2,           kw: "api keys" },
  { label: "Docs",           href: "/docs",          icon: FileText,        kw: "documentation help" },
  { label: "Billing",        href: "/billing",       icon: CreditCard,      kw: "credits payment plan" },
  { label: "Settings",       href: "/settings",      icon: Settings,        kw: "account team" },
];

const ACTIONS = [
  { label: "New Agent",        href: "/agents?new=1",  icon: Plus,          kw: "create build" },
  { label: "Start a Call",     href: "/calls?dial=1",  icon: PhoneOutgoing, kw: "dial outbound" },
  { label: "Buy Credits",      href: "/billing",       icon: CreditCard,    kw: "top up minutes" },
];

/** Opens the palette from anywhere: window.dispatchEvent(new Event("vaaniq:command")) */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
    };
    const onEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("vaaniq:command", onEvent);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("vaaniq:command", onEvent); };
  }, []);

  const go = (href: string) => { setOpen(false); router.push(href); };

  const itemCls =
    "flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-sm text-neutral-700 cursor-pointer " +
    "aria-selected:bg-brand-50 aria-selected:text-brand-700 transition-colors";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Menu"
      shouldFilter
      overlayClassName="fixed inset-0 z-[90] bg-neutral-900/40 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[18%] z-[91] w-[92vw] max-w-lg -translate-x-1/2"
    >
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-neutral-100">
          <Search className="icon-sm text-neutral-400 shrink-0" />
          <Command.Input
            placeholder="Search pages and actions…"
            className="w-full h-12 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-medium text-neutral-400 bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <Command.List className="max-h-[340px] overflow-y-auto py-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-neutral-400">No results found.</Command.Empty>

          <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-neutral-400">
            {ACTIONS.map(a => (
              <Command.Item key={a.label} value={`${a.label} ${a.kw}`} onSelect={() => go(a.href)} className={itemCls}>
                <a.icon className="icon-sm text-neutral-400" /> {a.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-neutral-400">
            {PAGES.map(p => (
              <Command.Item key={p.href} value={`${p.label} ${p.kw}`} onSelect={() => go(p.href)} className={itemCls}>
                <p.icon className="icon-sm text-neutral-400" /> {p.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
