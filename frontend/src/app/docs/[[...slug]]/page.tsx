"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DOCS, findPage, neighbors } from "../content";
import Toc from "../_toc";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function DocPage() {
  const params = useParams();
  const raw = (params?.slug as string[] | undefined)?.[0];
  const page = findPage(raw);
  const { prev, next } = neighbors(page.slug);
  const section = DOCS.find((s) => s.pages.some((p) => p.slug === page.slug))?.section ?? "";
  const Icon = page.icon;

  return (
    <div className="flex gap-12">
      <article className="flex-1 min-w-0 max-w-3xl">
        {/* Breadcrumb */}
        <div className="text-[12px] font-medium uppercase tracking-widest text-brand-500 mb-3">{section}</div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-7">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 text-brand-600 shrink-0"><Icon className="w-5 h-5" /></span>
          <h1 className="text-[30px] font-bold tracking-tight text-neutral-900">{page.title}</h1>
        </div>

        <div>{page.body}</div>

        {/* Prev / Next */}
        <div className="mt-14 pt-6 border-t border-neutral-100 grid grid-cols-2 gap-3">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="group rounded-xl border border-neutral-200 p-4 hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
              <span className="flex items-center gap-1 text-xs text-neutral-400 mb-1"><ArrowLeft className="w-3 h-3" /> Previous</span>
              <span className="text-sm font-medium text-neutral-800 group-hover:text-brand-700">{prev.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/docs/${next.slug}`} className="group rounded-xl border border-neutral-200 p-4 text-right hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
              <span className="flex items-center justify-end gap-1 text-xs text-neutral-400 mb-1">Next <ArrowRight className="w-3 h-3" /></span>
              <span className="text-sm font-medium text-neutral-800 group-hover:text-brand-700">{next.title}</span>
            </Link>
          ) : <span />}
        </div>
      </article>

      <Toc slug={page.slug} />
    </div>
  );
}
