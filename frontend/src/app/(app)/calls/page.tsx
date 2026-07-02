"use client";
import { useEffect, useRef, useState } from "react";
import {
  Phone, PhoneCall, Users,
} from "lucide-react";
import { getCalls, getAgents, getCallDetail, initiateCall, getRecordingUrl, hangupCall, getBillingBalance } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useCallsSocket } from "@/lib/useCallsSocket";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { KpiCards, FilterBar, CallsTable } from "@/components/calls";
import { SkeletonList } from "@/components/ui/Skeleton";

const DialModal = dynamic(() => import("@/components/calls/DialModal"), { ssr: false });
const BulkUploadModal = dynamic(() => import("@/components/calls/BulkUploadModal"), { ssr: false });
const CallDetailPanel = dynamic(() => import("@/components/calls/CallDetailPanel"), { ssr: false });

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);   // server grand total (all calls, not just the loaded page)
  const [initialLoading, setInitialLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "data">("overview");
  const [showDial, setShowDial] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const dialTrapRef = useFocusTrap<HTMLDivElement>(showDial, () => setShowDial(false));
  const [dialForm, setDialForm] = useState({ agent_id: "", phone_number: "", name: "" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [plan, setPlan] = useState<string>("");

  useEffect(() => {
    getCalls(undefined, 1, 200).then((data: any) => {
      setCalls(data.items);
      setTotalCalls(data.total ?? data.items.length);
    })
      .catch((e: unknown) => { console.error("getCalls failed:", e); })
      .finally(() => setInitialLoading(false));
    getAgents().then(setAgents).catch(() => {});
    getBillingBalance().then((b: any) => setPlan(b?.plan ?? "")).catch(() => {});
    if (new URLSearchParams(window.location.search).get("dial")) setShowDial(true);
  }, []);

  // Primary: live updates over a single WebSocket (server pushes on change).
  const { connected } = useCallsSocket((items, t) => {
    setCalls(items);
    if (typeof t === "number") setTotalCalls(t);
  });

  // Latest calls without re-subscribing the polling loop on every update.
  const callsRef = useRef(calls);
  callsRef.current = calls;

  // Fallback: HTTP polling, only while the socket is down. Visibility-gated and
  // backs off exponentially on repeated errors so a flaky backend isn't hammered.
  useEffect(() => {
    if (connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let errorStreak = 0;
    const tick = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") { timer = setTimeout(tick, 10000); return; }
      getCalls()
        .then((data: any) => {
          errorStreak = 0;
          if (!cancelled) { setCalls(data.items); setTotalCalls(data.total ?? data.items.length); }
        })
        .catch(() => { errorStreak = Math.min(errorStreak + 1, 4); })
        .finally(() => {
          if (cancelled) return;
          const hasLive = callsRef.current.some((c: any) =>
            c.status === "in_progress" || c.status === "ringing" || c.status === "initiated"
          );
          const base = hasLive ? 5000 : 10000;
          const backoff = errorStreak > 0 ? 2 ** errorStreak : 1;
          timer = setTimeout(tick, Math.min(base * backoff, 60000));
        });
    };
    timer = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [connected]);

  useEffect(() => {
    if (!detail?.call?.id) return;
    const live = new Set(["in_progress", "ringing", "initiated"]);
    if (!live.has(detail.call.status)) return;
    if (document.visibilityState !== "visible") return;
    const updated = calls.find((c: any) => c.id === detail.call.id);
    if (updated && updated !== detail.call) {
      setDetail((prev: any) => prev ? { ...prev, call: updated } : prev);
    }
  }, [calls, detail?.call?.id, detail?.call?.status]);

  const openCall = async (call: any) => {
    setDetail(null);
    setActiveTab("overview");
    setDetailLoading(true);
    try {
      const d = await getCallDetail(call.id);
      setDetail(d);
    } catch {
      toast.error("Failed to load call detail");
    }
    setDetailLoading(false);
  };

  const handleDial = async () => {
    if (!dialForm.agent_id || !dialForm.phone_number) {
      toast.error("Select an agent and enter a phone number");
      return;
    }
    const agent = agents.find((a: any) => a.id === dialForm.agent_id);
    // Optimistic: show the call in the list immediately, reconcile on response.
    const tempId = `optimistic-${Date.now()}`;
    const optimisticCall = {
      id: tempId,
      phone_number: dialForm.phone_number,
      status: "initiated",
      direction: "outbound",
      agent_id: dialForm.agent_id,
      agent_name: agent?.name ?? null,
      created_at: new Date().toISOString(),
      extra_data: dialForm.name.trim() ? { caller_name: dialForm.name.trim() } : undefined,
      _optimistic: true,
    };
    const payload: any = { agent_id: dialForm.agent_id, phone_number: dialForm.phone_number };
    if (dialForm.name.trim()) payload.contact_data = { name: dialForm.name.trim() };

    setCalls((c: any[]) => [optimisticCall, ...c]);
    setTotalCalls((t) => t + 1);
    setShowDial(false);

    try {
      const call = await initiateCall(payload);
      // Swap the placeholder for the real record.
      setCalls((c: any[]) => c.map((x: any) => (x.id === tempId ? call : x)));
      toast.success("Call initiated!");
    } catch (err: any) {
      // Roll back the optimistic entry.
      setCalls((c: any[]) => c.filter((x: any) => x.id !== tempId));
      setTotalCalls((t) => Math.max(0, t - 1));
      const msg = err?.response?.data?.detail;
      const status = err?.response?.status;
      if (status === 402) {
        toast.error(msg || "Insufficient balance. Please top up your account.");
      } else if (status === 409) {
        toast.error(msg || "A call to this number is already in progress.");
      } else {
        toast.error("Failed to initiate call");
      }
    }
  };

  const handleHangup = async (callId: string) => {
    try {
      await hangupCall(callId);
      toast.success("Call ended");
      const [updated, updatedList] = await Promise.all([
        getCallDetail(callId),
        getCalls(),
      ]);
      setDetail(updated);
      setCalls(updatedList.items);
      setTotalCalls(updatedList.total ?? updatedList.items.length);
    } catch {
      toast.error("Failed to end call");
    }
  };

  const closeDetail = () => { setDetail(null); setDetailLoading(false); };

  // ── KPIs ──
  // "Total Calls" is the server grand total (all calls); the rate/avg/cost stats
  // are computed over the loaded page (`loadedCount`), which is the recent window.
  const LIVE_STATUSES = new Set(["in_progress", "ringing", "initiated"]);
  const loadedCount = calls.length;
  const total = Math.max(totalCalls, loadedCount);
  const completedCount = calls.filter((c: any) => c.status === "completed").length;
  const liveCount = calls.filter((c: any) => LIVE_STATUSES.has(c.status)).length;
  const answeredPct = loadedCount ? Math.round((completedCount / loadedCount) * 100) : 0;
  const durCalls = calls.filter((c: any) => c.duration_seconds);
  const avgDur = durCalls.length
    ? Math.round(durCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / durCalls.length)
    : 0;
  const totalCost = calls.reduce((s: number, c: any) => s + (c.cost_usd || 0), 0);

  // ── Filtering ──
  const DAY_MS = 86_400_000;
  const dateCutoff = (() => {
    if (dateFilter === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (dateFilter === "7d") return Date.now() - 7 * DAY_MS;
    if (dateFilter === "30d") return Date.now() - 30 * DAY_MS;
    return 0;
  })();

  // Re-add toUTC inline since we removed the import from this file
  const toUTC = (iso: string) => iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";

  const filtered = calls.filter((c: any) => {
    if (dirFilter !== "all" && c.direction !== dirFilter) return false;
    if (agentFilter !== "all" && c.agent_id !== agentFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "live") { if (!LIVE_STATUSES.has(c.status)) return false; }
      else if (c.status !== statusFilter) return false;
    }
    if (dateCutoff && new Date(toUTC(c.created_at)).getTime() < dateCutoff) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.extra_data?.caller_name || "").toLowerCase();
      if (!String(c.phone_number).toLowerCase().includes(q) && !name.includes(q)) return false;
    }
    return true;
  });
  const filtersActive = !!search.trim() || statusFilter !== "all" || dirFilter !== "all" || agentFilter !== "all" || dateFilter !== "all";

  const resetFilters = () => {
    setSearch(""); setStatusFilter("all"); setDirFilter("all"); setAgentFilter("all"); setDateFilter("all");
  };

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error("No calls to export"); return; }
    const headers = ["Phone", "Name", "Direction", "Status", "Sentiment", "Duration (s)", "Cost (USD)", "Date"];
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const IST = "Asia/Kolkata";
    const rows = filtered.map((c: any) => [
      c.phone_number,
      c.extra_data?.caller_name || "",
      c.direction,
      c.status,
      (() => {
        if (c.sentiment_score == null) return "";
        if (c.sentiment_score >= 7) return "Positive";
        if (c.sentiment_score >= 4) return "Neutral";
        return "Negative";
      })(),
      c.duration_seconds ?? "",
      c.cost_usd != null ? c.cost_usd.toFixed(4) : "",
      new Date(toUTC(c.created_at)).toLocaleString("en-IN", { timeZone: IST }),
    ]);
    const csv = [headers, ...rows].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { setPage(1); }, [search, statusFilter, dirFilter, agentFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCalls = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const detailOpen = !!detail || detailLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 bg-white hover:bg-neutral-50 text-neutral-700 text-sm font-medium border border-neutral-200 hover:border-neutral-300 rounded-lg shadow-xs transition-all duration-150"
          >
            <Users className="w-4 h-4" /> <span className="hidden sm:inline">Bulk Call</span>
          </button>
          <button
            onClick={() => setShowDial(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors"
          >
            <PhoneCall className="w-4 h-4" /> Dial
          </button>
        </div>
      </div>

      <div className={`space-y-3 ${detailOpen ? "hidden lg:block" : "block"}`}>
        <KpiCards
          total={total}
          sampleCount={loadedCount}
          completedCount={completedCount}
          answeredPct={answeredPct}
          avgDur={avgDur}
          totalCost={totalCost}
          liveCount={liveCount}
          filtersActive={filtersActive}
          statusFilter={statusFilter}
          resetFilters={resetFilters}
          setStatusFilter={setStatusFilter}
        />

        <FilterBar
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          dirFilter={dirFilter}
          setDirFilter={setDirFilter}
          agentFilter={agentFilter}
          setAgentFilter={setAgentFilter}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          agents={agents}
          exportCsv={exportCsv}
        />
      </div>

      {initialLoading && calls.length === 0 ? (
        <SkeletonList rows={8} />
      ) : (
        <CallsTable
          filtered={filtered}
          pagedCalls={pagedCalls}
          totalPages={totalPages}
          currentPage={currentPage}
          setPage={setPage}
          detail={detail}
          openCall={openCall}
          filtersActive={filtersActive}
          calls={calls}
        />
      )}

      <CallDetailPanel
        detailOpen={detailOpen}
        detail={detail}
        detailLoading={detailLoading}
        closeDetail={closeDetail}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleHangup={handleHangup}
      />

      <DialModal
        show={showDial}
        setShow={setShowDial}
        agents={agents}
        dialForm={dialForm}
        setDialForm={setDialForm}
        handleDial={handleDial}
        dialTrapRef={dialTrapRef}
      />

      {showBulk && (
        <BulkUploadModal
          agents={agents}
          plan={plan}
          onClose={() => setShowBulk(false)}
          onLaunched={(count: number, suppressed: number) => {
            toast.success(
              `Campaign started — ${count} calls queued` +
              (suppressed ? ` · ${suppressed} skipped (Do-Not-Call)` : "")
            );
            setShowBulk(false);
            setTimeout(() => getCalls().then((data: any) => setCalls(data.items)).catch(() => {}), 3000);
          }}
        />
      )}
    </div>
  );
}
