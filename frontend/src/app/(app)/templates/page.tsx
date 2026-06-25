"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, Import, Eye, X, Bot, Check, ArrowRight, Target, CalendarCheck, Headphones, Wallet, GraduationCap, Star, Mic } from "lucide-react";
import { getTemplates, importTemplate } from "@/lib/api";
import toast from "react-hot-toast";

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  difficulty: string;
  duration: string;
  tags: string[];
  system_prompt: string;
  pipeline_mode: string;
  llm_model: string;
  voice_id: string;
  config: Record<string, any>;
}

const CATEGORIES = [
  "All",
  "Sales & Leads",
  "Appointments",
  "Support & Service",
  "Collections & Finance",
  "HR & Education",
  "Feedback"
];

// Category accents stay fully on-brand: every category uses the brand teal, and
// the icon alone distinguishes them (no off-palette pops).
// Class strings are written in full (Tailwind can't see dynamically-built names).
const TEAL = { avatar: "from-brand-400 to-brand-600", pill: "bg-brand-50 text-brand-700 border-brand-100" };
const CATEGORY_THEME: Record<string, { icon: any; avatar: string; pill: string }> = {
  "Sales & Leads":          { icon: Target,        ...TEAL },
  "Appointments":           { icon: CalendarCheck, ...TEAL },
  "Support & Service":      { icon: Headphones,    ...TEAL },
  "Collections & Finance":  { icon: Wallet,        ...TEAL },
  "HR & Education":         { icon: GraduationCap, ...TEAL },
  "Feedback":               { icon: Star,          ...TEAL },
};
const DEFAULT_THEME = { icon: Bot, ...TEAL };

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  
  // Modals state
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [importingTemplate, setImportingTemplate] = useState<Template | null>(null);
  
  // Import form state
  const [importName, setImportName] = useState("");
  const [isPersonal, setIsPersonal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTemplates()
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load templates", err);
        toast.error("Failed to load agent templates");
        setLoading(false);
      });
  }, []);

  const handleOpenImport = (tpl: Template) => {
    setImportingTemplate(tpl);
    setImportName(tpl.name);
    setIsPersonal(false);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importingTemplate) return;

    setSubmitting(true);
    try {
      const result = await importTemplate(importingTemplate.id, {
        name: importName.trim() || importingTemplate.name,
        is_personal: isPersonal
      });
      toast.success("Agent imported successfully!");
      // Redirect to the agent editing page
      router.push(`/agents/${result.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to import agent template");
    } finally {
      setSubmitting(false);
      setImportingTemplate(null);
    }
  };

  const filtered = templates.filter((tpl) => {
    const matchesSearch = 
      tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesCategory = selectedCategory === "All" || tpl.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search templates, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-4 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all duration-150"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scroll-thin">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-150 whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-brand-50 text-brand-700 border-brand-200 shadow-sm"
                  : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 shadow-card">
              <div className="h-6 w-3/4 bg-neutral-100 rounded animate-pulse" />
              <div className="h-12 w-full bg-neutral-50 rounded animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-neutral-100 rounded-full animate-pulse" />
                <div className="h-5 w-16 bg-neutral-100 rounded-full animate-pulse" />
              </div>
              <div className="flex gap-2 pt-4 border-t border-neutral-100">
                <div className="h-9 flex-1 bg-neutral-100 rounded-lg animate-pulse" />
                <div className="h-9 flex-1 bg-neutral-100 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white border border-dashed border-neutral-300 rounded-2xl">
          <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-neutral-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-700">No templates found</p>
            <p className="text-xs text-neutral-400 mt-1">Try adjusting your filters or search keywords.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((tpl) => {
            const theme = CATEGORY_THEME[tpl.category] ?? DEFAULT_THEME;
            const Icon = theme.icon;
            return (
            <div
              key={tpl.id}
              className="group relative bg-white border border-neutral-200 hover:border-brand-300 rounded-2xl p-5 flex flex-col justify-between shadow-card hover:shadow-hover transition-all duration-200 overflow-hidden"
            >
              {/* Category accent bar */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.avatar}`} />

              <div className="space-y-3">
                {/* Top row: category icon avatar + difficulty / duration */}
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${theme.avatar} flex items-center justify-center text-white shadow-xs`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      tpl.difficulty === "Beginner"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "bg-amber-50 text-amber-700 border border-amber-100"
                    }`}>
                      {tpl.difficulty}
                    </span>
                    <span className="text-[11px] text-neutral-400 font-medium">
                      {tpl.duration}
                    </span>
                  </div>
                </div>

                {/* Name */}
                <h3 className="font-semibold text-neutral-900 text-[15px] group-hover:text-brand-600 transition-colors">
                  {tpl.name}
                </h3>

                {/* Category pill + voice badge */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${theme.pill}`}>
                    {tpl.category}
                  </span>
                  {tpl.voice_id && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded-md">
                      <Mic className="w-3 h-3 text-neutral-400" /> {tpl.voice_id}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
                  {tpl.description}
                </p>

                {/* Tags (cap at 3) */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {tpl.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] text-neutral-400 bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                  {tpl.tags.length > 3 && (
                    <span className="text-[10px] text-neutral-400 px-1 py-0.5">+{tpl.tags.length - 3}</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-5 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setPreviewTemplate(tpl)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-neutral-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview Prompt
                </button>
                <button
                  onClick={() => handleOpenImport(tpl)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                >
                  <Import className="w-3.5 h-3.5" /> Use Template
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ─── Preview Modal ─── */}
      {previewTemplate && (() => {
        const theme = CATEGORY_THEME[previewTemplate.category] ?? DEFAULT_THEME;
        const Icon = theme.icon;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-neutral-200 w-full max-w-2xl rounded-2xl shadow-modal flex flex-col max-h-[85vh] animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.avatar} flex items-center justify-center text-white shadow-xs flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 text-base">{previewTemplate.name}</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{previewTemplate.category} Template</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-150 hover:text-neutral-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-5 scroll-thin flex-1">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-150 text-center">
                <div>
                  <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Mode</p>
                  <p className="text-xs font-semibold text-neutral-700 capitalize mt-0.5">{previewTemplate.pipeline_mode}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Model</p>
                  <p className="text-xs font-semibold text-neutral-700 mt-0.5">Tierce Voice Engine</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Voice ID</p>
                  <p className="text-xs font-semibold text-neutral-700 capitalize mt-0.5">{previewTemplate.voice_id}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">Description</h4>
                <p className="text-xs text-neutral-500 leading-relaxed">{previewTemplate.description}</p>
              </div>

              {/* System Prompt */}
              <div>
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">System Instructions Prompt</h4>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 overflow-x-auto">
                  <pre className="text-xs text-neutral-600 font-mono whitespace-pre-wrap leading-relaxed">
                    {previewTemplate.system_prompt}
                  </pre>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-neutral-100 flex justify-end gap-2 bg-neutral-50/50 rounded-b-2xl">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="inline-flex items-center justify-center h-9 px-4 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setPreviewTemplate(null);
                  handleOpenImport(previewTemplate);
                }}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
              >
                <Import className="w-3.5 h-3.5" /> Use Template
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Import / Customize Modal ─── */}
      {importingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-neutral-200 w-full max-w-md rounded-2xl shadow-modal flex flex-col animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 text-sm">Import Template</h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Customize properties before importing</p>
                </div>
              </div>
              <button
                onClick={() => setImportingTemplate(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-150 hover:text-neutral-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleImport}>
              <div className="p-5 space-y-4">
                {/* Agent Name */}
                <div>
                  <label htmlFor="import-name" className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Agent Name
                  </label>
                  <input
                    id="import-name"
                    type="text"
                    required
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all duration-150"
                  />
                </div>

                {/* Scope */}
                <div>
                  <span className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
                    Visibility Scope
                  </span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsPersonal(false)}
                      className={`p-3 border rounded-xl flex flex-col gap-1 text-left transition-all ${
                        !isPersonal
                          ? "border-brand-500 bg-brand-50/30 text-brand-900"
                          : "border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-white"
                      }`}
                    >
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        {!isPersonal && <Check className="w-3.5 h-3.5 text-brand-500" />}
                        Workspace
                      </span>
                      <span className="text-[10px] text-neutral-400">Shared with team members</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setIsPersonal(true)}
                      className={`p-3 border rounded-xl flex flex-col gap-1 text-left transition-all ${
                        isPersonal
                          ? "border-brand-500 bg-brand-50/30 text-brand-900"
                          : "border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-white"
                      }`}
                    >
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        {isPersonal && <Check className="w-3.5 h-3.5 text-brand-500" />}
                        Personal
                      </span>
                      <span className="text-[10px] text-neutral-400">Only visible to you</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-neutral-100 flex justify-end gap-2 bg-neutral-50/50 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setImportingTemplate(null)}
                  className="inline-flex items-center justify-center h-9 px-4 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? "Importing..." : "Confirm & Import"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
