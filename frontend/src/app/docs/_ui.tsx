"use client";
import { useState, ReactNode, Children } from "react";
import Link from "next/link";
import { Copy, Check, Info, AlertTriangle, Lightbulb, StickyNote, ArrowRight } from "lucide-react";

export function slugify(node: ReactNode): string {
  const text = typeof node === "string" ? node : Children.toArray(node).map((c) => (typeof c === "string" ? c : "")).join(" ");
  return text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[17px] leading-8 text-neutral-500 mb-8">{children}</p>;
}
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 id={slugify(children)} className="group scroll-mt-24 text-[22px] font-semibold text-neutral-900 mt-12 mb-4 pb-2 border-b border-neutral-100 flex items-center gap-2">
      {children}
    </h2>
  );
}
export function H3({ children }: { children: ReactNode }) {
  return <h3 id={slugify(children)} className="scroll-mt-24 text-[17px] font-semibold text-neutral-900 mt-8 mb-2.5">{children}</h3>;
}
export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-7 text-neutral-600 mb-4">{children}</p>;
}
export function Ul({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 mb-5">{Children.map(children, (c) => c)}</ul>;
}
export function Ol({ children }: { children: ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-7 text-neutral-600 mb-5 marker:text-neutral-400 marker:font-medium">{children}</ol>;
}
export function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-7 text-neutral-600">
      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
      <span>{children}</span>
    </li>
  );
}
export function OLi({ children }: { children: ReactNode }) { return <li>{children}</li>; }
export function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-neutral-900">{children}</span>;
}
export function Code({ children }: { children: ReactNode }) {
  return <code className="text-[13px] font-mono text-brand-700 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/15">{children}</code>;
}
export function Divider() { return <hr className="my-10 border-neutral-100" />; }

export function CodeBlock({ code, lang = "bash", title }: { code: string; lang?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden shadow-sm mb-6 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <span className="text-[11px] font-medium text-neutral-400">{title || lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          className="text-neutral-500 hover:text-neutral-200 transition-colors"
          title="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="p-4 text-neutral-100 text-[13px] leading-6 font-mono overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 mb-6 shadow-xs">
      <table className="w-full text-[14px]">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>{head.map((h, i) => <th key={i} className="text-left font-semibold text-neutral-700 px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-neutral-50/60">
              {r.map((c, j) => <td key={j} className="px-4 py-2.5 text-neutral-600 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CALLOUT = {
  info:    { icon: Info,          cls: "bg-blue-50 border-blue-200/70 text-blue-900",       ic: "text-blue-500" },
  warning: { icon: AlertTriangle, cls: "bg-amber-50 border-amber-200/70 text-amber-900",    ic: "text-amber-500" },
  tip:     { icon: Lightbulb,     cls: "bg-emerald-50 border-emerald-200/70 text-emerald-900", ic: "text-emerald-500" },
  note:    { icon: StickyNote,    cls: "bg-neutral-50 border-neutral-200 text-neutral-700",  ic: "text-neutral-400" },
};
export function Callout({ type = "info", children }: { type?: keyof typeof CALLOUT; children: ReactNode }) {
  const c = CALLOUT[type];
  const Icon = c.icon;
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 mb-6 text-[14px] leading-6 ${c.cls}`}>
      <Icon className={`w-[18px] h-[18px] mt-0.5 shrink-0 ${c.ic}`} />
      <div className="[&_a]:underline">{children}</div>
    </div>
  );
}

export function Endpoint({ method, path }: { method: string; path: string }) {
  const color = method === "POST" ? "bg-emerald-500" : method === "DELETE" ? "bg-red-500" : method === "PUT" ? "bg-amber-500" : "bg-sky-500";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white px-3.5 py-2.5 mb-5 font-mono text-[13.5px] shadow-xs">
      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold text-white ${color}`}>{method}</span>
      <span className="text-neutral-800">{path}</span>
    </div>
  );
}

// ── Cards (Mintlify-style) ─────────────────────────────────────────────────────
export function CardGroup({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return <div className={`grid gap-4 mb-6 ${cols === 3 ? "sm:grid-cols-3" : cols === 1 ? "" : "sm:grid-cols-2"}`}>{children}</div>;
}
export function Card({ icon: Icon, title, href, children }: { icon?: any; title: string; href?: string; children?: ReactNode }) {
  const inner = (
    <div className="group h-full rounded-2xl border border-neutral-200 bg-white p-5 transition-all hover:border-brand-300 hover:shadow-md">
      {Icon && <span className="inline-grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600 mb-3 group-hover:bg-brand-500 group-hover:text-white transition-colors"><Icon className="w-[18px] h-[18px]" /></span>}
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900">{title}{href && <ArrowRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />}</div>
      {children && <p className="text-[13.5px] leading-6 text-neutral-500 mt-1">{children}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Steps ───────────────────────────────────────────────────────────────────
export function Steps({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <div className="mb-6">
      {items.map((child, i) => (
        <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-neutral-200" />}
          <span className="relative z-10 grid place-items-center w-8 h-8 shrink-0 rounded-full bg-brand-500 text-white text-[13px] font-semibold">{i + 1}</span>
          <div className="pt-0.5 min-w-0 flex-1">{child}</div>
        </div>
      ))}
    </div>
  );
}
export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <div className="text-[15px] font-semibold text-neutral-900 mb-1">{title}</div>
      <div className="text-[14.5px] leading-7 text-neutral-600 [&_p]:mb-2">{children}</div>
    </div>
  );
}

// ── API parameters ──────────────────────────────────────────────────────────
export function Properties({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 mb-6 overflow-hidden">{children}</div>;
}
export function Property({ name, type, required, children }: { name: string; type: string; required?: boolean; children?: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-[13px] font-mono font-semibold text-neutral-900">{name}</code>
        <span className="text-[11px] font-mono text-neutral-400">{type}</span>
        {required ? <span className="text-[10px] font-semibold uppercase tracking-wide text-red-500">required</span>
                  : <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300">optional</span>}
      </div>
      {children && <p className="text-[13.5px] leading-6 text-neutral-500 mt-1">{children}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "green" | "amber" }) {
  const map = { neutral: "bg-neutral-100 text-neutral-600", brand: "bg-brand-50 text-brand-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[tone]}`}>{children}</span>;
}
