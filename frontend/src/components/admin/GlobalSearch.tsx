"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, Users, Phone, Hash, Loader2 } from "lucide-react";
import { adminGet } from "@/components/admin/ui";

interface Results {
  workspaces: { id: string; name: string }[];
  users: { id: string; email: string }[];
  calls: { id: string; phone_number: string; workspace_name: string }[];
  phone_numbers: { id: string; phone_number: string; workspace_name: string }[];
}

const EMPTY: Results = { workspaces: [], users: [], calls: [], phone_numbers: [] };

/**
 * Global admin search — one box across workspaces, users, calls & phone numbers.
 * Each result deep-links to the relevant list page pre-filtered by ?search=.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      adminGet(`/search?q=${encodeURIComponent(term)}`)
        .then((d: Results) => setRes(d))
        .catch(() => setRes(EMPTY))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  const total = res.workspaces.length + res.users.length + res.calls.length + res.phone_numbers.length;
  const showDropdown = open && q.trim().length >= 2;

  const Group = ({ label, icon: Icon, items }: { label: string; icon: React.ElementType; items: { key: string; primary: string; secondary?: string; href: string }[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="py-1">
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5"><Icon className="w-3 h-3" /> {label}</p>
        {items.map(it => (
          <button key={it.key} onClick={() => go(it.href)}
            className="w-full text-left px-3 py-2 hover:bg-neutral-50 transition-colors flex items-center justify-between gap-3">
            <span className="text-sm text-neutral-800 truncate">{it.primary}</span>
            {it.secondary && <span className="text-xs text-neutral-400 truncate shrink-0">{it.secondary}</span>}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search workspaces, users, calls, numbers…"
        className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-9 h-10 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 animate-spin" />}

      {showDropdown && (
        <div className="absolute z-40 mt-1 left-0 right-0 bg-white border border-neutral-200 rounded-xl shadow-hover max-h-[60vh] overflow-y-auto divide-y divide-neutral-100">
          {total === 0 && !loading ? (
            <p className="px-3 py-6 text-sm text-neutral-400 text-center">No matches for “{q.trim()}”.</p>
          ) : (
            <>
              <Group label="Workspaces" icon={Building2} items={res.workspaces.map(w => ({ key: w.id, primary: w.name, href: `/admin/workspaces?search=${encodeURIComponent(w.name)}` }))} />
              <Group label="Users" icon={Users} items={res.users.map(u => ({ key: u.id, primary: u.email, href: `/admin/users?search=${encodeURIComponent(u.email)}` }))} />
              <Group label="Calls" icon={Phone} items={res.calls.map(c => ({ key: c.id, primary: c.phone_number, secondary: c.workspace_name, href: `/admin/calls?search=${encodeURIComponent(c.phone_number)}` }))} />
              <Group label="Phone Numbers" icon={Hash} items={res.phone_numbers.map(p => ({ key: p.id, primary: p.phone_number, secondary: p.workspace_name, href: `/admin/phone-numbers?search=${encodeURIComponent(p.phone_number)}` }))} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
