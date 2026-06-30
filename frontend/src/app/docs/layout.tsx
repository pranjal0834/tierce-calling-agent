"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS } from "./content";
import DocsSearch from "./_search";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { VaaniqWave } from "@/components/VaaniqLogo";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const firstSlug = DOCS[0].pages[0].slug;

  const Nav = (
    <nav className="px-3 py-6 space-y-7">
      {DOCS.map((section) => (
        <div key={section.section}>
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{section.section}</p>
          <div className="space-y-0.5">
            {section.pages.map((p) => {
              const href = `/docs/${p.slug}`;
              const active = pathname === href || (pathname === "/docs" && p.slug === firstSlug);
              const Icon = p.icon;
              return (
                <Link
                  key={p.slug}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors ${
                    active ? "bg-brand-50 text-brand-700 font-medium" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-brand-500" : "text-neutral-400 group-hover:text-neutral-600"}`} />
                  {p.title}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-[88rem] flex items-center gap-4 px-4 sm:px-6 h-14">
          <button className="lg:hidden text-neutral-500" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/docs" className="flex items-center gap-2 shrink-0">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm"><VaaniqWave className="icon-sm" /></span>
            <span className="font-semibold tracking-tight">Vaaniq <span className="text-neutral-400 font-normal">Docs</span></span>
          </Link>
          <div className="flex-1 hidden sm:flex justify-center"><DocsSearch /></div>
          <Link href="/" className="ml-auto sm:ml-0 inline-flex items-center gap-1 rounded-lg bg-neutral-900 text-white px-3 h-9 text-sm font-medium hover:bg-neutral-800 transition-colors shrink-0">
            Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[88rem] flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-neutral-200 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          {Nav}
        </aside>

        {/* Sidebar — mobile drawer */}
        {open && (
          <div className="lg:hidden fixed inset-0 z-20 top-14">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-neutral-200 overflow-y-auto">
              <div className="px-4 pt-4 sm:hidden"><DocsSearch /></div>
              {Nav}
            </aside>
          </div>
        )}

        {/* Content (article + on-this-page TOC live inside the page) */}
        <main className="flex-1 min-w-0 px-5 sm:px-10 lg:px-14 py-10">{children}</main>
      </div>
    </div>
  );
}
