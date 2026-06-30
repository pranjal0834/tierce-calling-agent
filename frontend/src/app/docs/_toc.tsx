"use client";
import { useEffect, useState } from "react";

interface Heading { id: string; text: string; level: number }

export default function Toc({ slug }: { slug: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("article h2[id], article h3[id]")) as HTMLElement[];
    const hs = nodes.map((n) => ({ id: n.id, text: n.textContent || "", level: n.tagName === "H2" ? 2 : 3 }));
    setHeadings(hs);
    if (!hs.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [slug]);

  if (headings.length < 2) return <div className="hidden xl:block w-56 shrink-0" />;

  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-20">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">On this page</p>
        <nav className="space-y-1 border-l border-neutral-200">
          {headings.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              className={`block py-1 text-[13px] leading-5 border-l-2 -ml-px transition-colors ${
                h.level === 3 ? "pl-6" : "pl-3"
              } ${active === h.id ? "border-brand-500 text-brand-600 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}
            >
              {h.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
