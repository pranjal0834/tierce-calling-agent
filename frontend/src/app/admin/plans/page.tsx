"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  RefreshCw, Plus, Pencil, Trash2, Check, X, GripVertical,
  DollarSign, Clock, ShieldCheck, Phone, MessageCircle, Webhook,
  Download, Upload, Users, Bot,
} from "lucide-react";
import { adminGet, adminPost, adminPut, adminDelete, PageHeading, LoadingBlock, Pill, CardLabel } from "@/components/admin/ui";

interface Plan {
  id: string;
  slug: string;
  label: string;
  description: string;
  price_inr: number;
  price_usd: number;
  minutes: number | null;
  is_active: boolean;
  sort_order: number;
  features: Record<string, boolean>;
  rate_limits: Record<string, number>;
  created_at: string | null;
  updated_at: string | null;
}

const FEATURE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  can_buy_phone_numbers: { label: "Phone Numbers", icon: Phone },
  can_inbound_call: { label: "Inbound Calling", icon: Phone },
  bulk_campaign: { label: "Bulk Campaigns", icon: Users },
  can_export_data: { label: "Export Data", icon: Download },
  can_use_whatsapp: { label: "WhatsApp", icon: MessageCircle },
  can_create_webhooks: { label: "Webhooks", icon: Webhook },
};

const LIMIT_LABELS: Record<string, string> = {
  max_bulk_contacts: "Max Bulk Contacts",
  max_agents: "Max Agents",
  max_concurrent_calls: "Max Concurrent Calls",
  free_trial_minutes: "Free Trial Minutes",
  payg_min_minutes: "PAYG Min Minutes",
  payg_max_minutes: "PAYG Max Minutes",
};

const BUILTIN_SLUGS = ["free", "starter", "payg", "growth", "pro", "scale"];

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Plan>>({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGet("/plans");
      setPlans(data.items ?? []);
    } catch { toast.error("Failed to load plans"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditForm({ ...plan });
    setCreating(false);
  }

  function startCreate() {
    setCreating(true);
    setEditingId("new");
    setEditForm({
      slug: "", label: "", description: "", price_inr: 0, price_usd: 0,
      minutes: null, is_active: true, sort_order: plans.length,
      features: { can_buy_phone_numbers: true, can_inbound_call: true, bulk_campaign: true, can_export_data: true, can_use_whatsapp: true, can_create_webhooks: true },
      rate_limits: { max_bulk_contacts: 99999, max_agents: 10, max_concurrent_calls: 5, free_trial_minutes: 0 },
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setEditForm({});
  }

  async function save() {
    if (!editForm.label || !editForm.slug) {
      toast.error("Label and slug are required");
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        await adminPost("/plans", editForm);
        toast.success("Plan created");
      } else {
        await adminPut(`/plans/${editingId}`, editForm);
        toast.success("Plan updated");
      }
      cancelEdit();
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to save plan");
    } finally { setSaving(false); }
  }

  async function handleDelete(plan: Plan) {
    if (!confirm(`Delete "${plan.label}"? This cannot be undone.`)) return;
    try {
      await adminDelete(`/plans/${plan.id}`);
      toast.success("Plan deleted");
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to delete plan");
    }
  }

  function toggleFeature(key: string) {
    setEditForm(f => ({ ...f, features: { ...f.features, [key]: !f.features?.[key] } }));
  }

  function setLimit(key: string, value: string) {
    const num = parseInt(value, 10);
    setEditForm(f => ({ ...f, rate_limits: { ...f.rate_limits, [key]: isNaN(num) ? 0 : num } }));
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeading
        title="Plan Management"
        subtitle="Configure pricing plans, feature flags, and rate limits per tier"
        action={
          <div className="flex gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={startCreate} className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> New Plan
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        {plans.map(plan => {
          const isEditing = editingId === plan.id;
          const isBuiltin = BUILTIN_SLUGS.includes(plan.slug);
          const form = isEditing ? editForm : plan;
          const f = form.features || {};
          const r = form.rate_limits || {};

          return (
            <div key={plan.id} className={`bg-white border rounded-xl shadow-xs overflow-hidden transition-all ${isEditing ? "border-brand-400 ring-2 ring-brand-500/10" : "border-neutral-200"}`}>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${plan.is_active ? "bg-success-400" : "bg-neutral-300"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{plan.label}</p>
                    <p className="text-xs text-neutral-400 font-mono">{plan.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  {plan.minutes != null && (
                    <span title="Included minutes"><Clock className="icon-xs inline mr-1" />{plan.minutes} min</span>
                  )}
                  {plan.price_inr > 0 && (
                    <span title="Price (INR)" className="font-medium text-neutral-700">₹{plan.price_inr.toLocaleString()}</span>
                  )}
                  {plan.price_usd > 0 && (
                    <span title="Price (USD)" className="font-medium text-neutral-700">${plan.price_usd.toFixed(2)}</span>
                  )}
                  <Pill tone={plan.is_active ? "emerald" : "neutral"}>{plan.is_active ? "Active" : "Inactive"}</Pill>
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(plan)} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Edit plan">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isBuiltin && (
                      <button onClick={() => handleDelete(plan)} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors" title="Delete plan">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded editor */}
              {isEditing && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-5 space-y-5">
                  {/* Basic info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="label-base">Label</label>
                      <input className="input-base" value={form.label || ""} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} placeholder="Starter" />
                    </div>
                    <div>
                      <label className="label-base">Slug</label>
                      <input className="input-base font-mono" value={form.slug || ""} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))} placeholder="starter" disabled={!creating} />
                    </div>
                    <div>
                      <label className="label-base">Price (INR)</label>
                      <input className="input-base" type="number" value={form.price_inr ?? 0} onChange={e => setEditForm(f => ({ ...f, price_inr: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="label-base">Price (USD)</label>
                      <input className="input-base" type="number" step="0.01" value={form.price_usd ?? 0} onChange={e => setEditForm(f => ({ ...f, price_usd: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="label-base">Minutes (pack)</label>
                      <input className="input-base" type="number" value={form.minutes ?? ""} onChange={e => setEditForm(f => ({ ...f, minutes: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="Leave empty for PAYG" />
                    </div>
                    <div>
                      <label className="label-base">Sort order</label>
                      <input className="input-base" type="number" value={form.sort_order ?? 0} onChange={e => setEditForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label-base">Description</label>
                      <input className="input-base" value={form.description || ""} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this plan…" />
                    </div>
                    <div className="flex items-center gap-3 pt-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!!form.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-neutral-300 text-brand-500 focus:ring-brand-500" />
                        <span className="text-sm text-neutral-700">Active</span>
                      </label>
                    </div>
                  </div>

                  {/* Feature flags */}
                  <div>
                    <CardLabel>Feature Flags</CardLabel>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(FEATURE_LABELS).map(([key, { label, icon: Icon }]) => (
                        <button
                          key={key}
                          onClick={() => toggleFeature(key)}
                          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                            f[key] ? "bg-success-50 border-success-200 text-success-700" : "bg-white border-neutral-200 text-neutral-400"
                          }`}
                        >
                          {f[key] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          <Icon className="w-3 h-3" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rate limits */}
                  <div>
                    <CardLabel>Rate Limits</CardLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {Object.keys(LIMIT_LABELS).map(key => (
                        <div key={key}>
                          <label className="text-[11px] font-medium text-neutral-500 block mb-1">{LIMIT_LABELS[key]}</label>
                          <input className="input-base" type="number" value={r[key] ?? 0} onChange={e => setLimit(key, e.target.value)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <button onClick={save} disabled={saving}
                      className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                      {saving ? "Saving…" : creating ? "Create Plan" : "Save Changes"}
                    </button>
                    <button onClick={cancelEdit} disabled={saving}
                      className="inline-flex items-center gap-1.5 h-9 px-4 bg-white border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-600 rounded-lg transition-colors disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {plans.length === 0 && !loading && (
          <p className="text-sm text-neutral-400 text-center py-10">No plans found. Create one to get started.</p>
        )}
      </div>
    </>
  );
}
