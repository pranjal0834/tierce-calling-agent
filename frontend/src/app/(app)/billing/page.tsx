"use client";
import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Zap, TrendingUp, RefreshCw,
  CheckCircle2, ArrowDownLeft, ArrowUpRight,
  Lock, Phone,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getBillingBalance, getBillingPacks, getBillingTransactions,
  createRazorpayOrder, verifyRazorpayPayment, testPurchase,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pack {
  label: string;
  minutes: number;
  price_inr?: number;
}

interface Transaction {
  id: string;
  type: string;
  minutes: number;
  balance_after: number;
  description: string;
  payment_provider?: string;
  pack_id?: string;
  amount_paid?: number;
  currency?: string;
  created_at: string;
}

// ── Razorpay global type ───────────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtMins(m: number) {
  const abs = Math.abs(m);
  if (abs < 1) return `${Math.round(abs * 60)}s`;
  return `${abs.toFixed(1)} min`;
}

const TX_ICONS: Record<string, React.ReactNode> = {
  purchase:    <ArrowUpRight className="w-4 h-4 text-green-500" />,
  free_trial:  <Zap className="w-4 h-4 text-yellow-500" />,
  deduction:   <ArrowDownLeft className="w-4 h-4 text-red-500" />,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [packs, setPacks] = useState<{ inr: Record<string, Pack> } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  const isTrial = plan === "free";

  const refresh = useCallback(async () => {
    try {
      const [bal, pkData, txs] = await Promise.all([
        getBillingBalance(),
        getBillingPacks(),
        getBillingTransactions(20),
      ]);
      setBalance(bal.credits_balance);
      setPlan(bal.plan ?? "free");
      setPacks({ inr: pkData.inr.packs });
      setTestMode(!!pkData.test_mode);
      setTransactions(txs);
    } catch {
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRazorpay(packId: string, pack: Pack) {
    setPurchasing(packId);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Could not load Razorpay. Please try again."); return; }

      const order = await createRazorpayOrder(packId);

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: "INR",
          name: "Vaaniq Voice AI",
          description: `${pack.label} — ${pack.minutes} minutes`,
          order_id: order.order_id,
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const result = await verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                pack_id: packId,
              });
              setBalance(result.balance);
              toast.success(`${pack.minutes} minutes added to your account!`);
              await refresh();
              resolve();
            } catch {
              reject(new Error("Payment verification failed"));
            }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
          theme: { color: "#6366f1" },
        });
        rzp.open();
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "dismissed") {
        toast.error(err.message || "Payment failed");
      }
    } finally {
      setPurchasing(null);
    }
  }

  async function handleTestPurchase(packId: string, pack: Pack) {
    setPurchasing(packId);
    try {
      const result = await testPurchase(packId);
      setBalance(result.balance);
      toast.success(`[Test] ${pack.minutes} minutes added!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Test purchase failed");
    } finally {
      setPurchasing(null);
    }
  }

  function handleBuy(packId: string, pack: Pack) {
    if (testMode) return handleTestPurchase(packId, pack);
    return handleRazorpay(packId, pack);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentPacks: Record<string, Pack> = packs ? packs.inr : {};

  return (
    <div className="space-y-6">

      {/* Page actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={refresh}
          className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5 transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Test mode banner */}
      {testMode && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Test mode is on.</span> Clicking “Buy Now” will simulate a successful
            payment and add credits instantly — no real money is charged. Turn off <code className="font-mono">BILLING_TEST_MODE</code> for live payments.
          </p>
        </div>
      )}

      {/* Trial callout */}
      {isTrial && (
        <div className="bg-brand-500/8 border border-brand-500/25 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-brand-500/15 border border-brand-500/25 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 mb-1">
                Buy any pack to unlock dedicated phone numbers
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                You&apos;re on the free trial — your agents make outbound calls using Vaaniq&apos;s shared number.
                Once you buy any pack below, you can purchase your own dedicated number for inbound calls and branded caller ID.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance card */}
      <div className="bg-gradient-to-br from-brand-500/15 to-purple-600/15 border border-brand-500/25 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-brand-600 mb-1 font-medium">Available Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-bold text-neutral-900">
                {balance != null ? balance.toFixed(1) : "—"}
              </span>
              <span className="text-base sm:text-lg text-brand-500">minutes</span>
            </div>
            {balance != null && balance <= 5 && balance > 0 && (
              <p className="mt-2 text-sm text-yellow-600 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Low balance — top up to keep making calls
              </p>
            )}
            {balance != null && balance <= 0 && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> No balance — calls are blocked until you top up
              </p>
            )}
          </div>
          <TrendingUp className="w-10 h-10 text-brand-400/30 shrink-0" />
        </div>
        <div className="mt-4 pt-4 border-t border-brand-500/15 text-xs text-neutral-500">
          Free trial: 20 minutes on signup &nbsp;·&nbsp; Pay-as-you-go: ₹10/min
        </div>
      </div>

      {/* Packs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(currentPacks).map(([packId, pack]) => {
          const price = pack.price_inr;
          const symbol = "₹";
          const perMin = price != null ? (price / pack.minutes).toFixed(2) : null;
          const isPopular = packId === "growth";
          const isBuying = purchasing === packId;

          return (
            <div
              key={packId}
              className={`relative flex flex-col rounded-2xl border p-4 sm:p-5 transition-all ${
                isPopular
                  ? "border-brand-500/60 bg-brand-500/8 shadow-sm"
                  : "border-neutral-200 bg-white shadow-sm hover:border-neutral-300"
              }`}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-500 text-white px-3 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="mb-3">
                <p className="text-sm font-semibold text-neutral-900">{pack.label}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{pack.minutes} minutes</p>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[22px] font-semibold text-neutral-900 tracking-tight">{symbol}{price}</span>
              </div>
              {perMin && (
                <p className="text-xs text-neutral-400 mb-2">{symbol}{perMin}/min</p>
              )}
              <div className="flex items-center gap-1 text-xs text-emerald-600 mb-3">
                <Phone className="w-3 h-3" />
                Unlocks dedicated phone numbers
              </div>
              <button
                onClick={() => handleBuy(packId, pack)}
                disabled={isBuying}
                className={`mt-auto w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isPopular
                    ? "bg-brand-500 hover:bg-brand-600 text-white shadow-xs"
                    : "bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 hover:border-neutral-300"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isBuying ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                ) : (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Buy Now</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-neutral-500 bg-white rounded-xl border border-neutral-200 border-dashed">
            No transactions yet
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 shadow-sm rounded-xl overflow-hidden">
            <div className="divide-y divide-neutral-100">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 sm:gap-4 px-4 py-3 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {TX_ICONS[tx.type] ?? <CreditCard className="w-4 h-4 text-neutral-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900 truncate">{tx.description || tx.type}</p>
                    <p className="text-xs text-neutral-500">{fmtDate(tx.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-medium ${tx.minutes >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.minutes >= 0 ? "+" : ""}{fmtMins(tx.minutes)}
                    </p>
                    {tx.amount_paid != null && (
                      <p className="text-xs text-neutral-500">
                        {tx.currency === "INR" ? "₹" : "$"}{tx.amount_paid}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 w-20 hidden sm:block">
                    <p className="text-xs text-neutral-500">{tx.balance_after.toFixed(1)} min</p>
                    <p className="text-xs text-neutral-400">balance</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
