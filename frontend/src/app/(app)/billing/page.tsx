"use client";
import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Zap, TrendingUp, RefreshCw,
  CheckCircle2, ArrowDownLeft, ArrowUpRight,
  Globe, IndianRupee, Lock, Phone,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getBillingBalance, getBillingPacks, getBillingTransactions,
  createRazorpayOrder, verifyRazorpayPayment, createStripeCheckout,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pack {
  label: string;
  minutes: number;
  price_inr?: number;
  price_usd?: number;
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
  purchase:    <ArrowUpRight className="w-4 h-4 text-green-400" />,
  free_trial:  <Zap className="w-4 h-4 text-yellow-400" />,
  deduction:   <ArrowDownLeft className="w-4 h-4 text-red-400" />,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [packs, setPacks] = useState<{ inr: Record<string, Pack>; usd: Record<string, Pack> } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<"inr" | "usd">("inr");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

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
      setPacks({ inr: pkData.inr.packs, usd: pkData.usd.packs });
      setTransactions(txs);
    } catch {
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Check for Stripe redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      toast.success("Payment successful! Credits will appear shortly.");
      window.history.replaceState({}, "", "/billing");
      setTimeout(refresh, 3000);
    } else if (payment === "cancelled") {
      toast("Payment cancelled.", { icon: "ℹ️" });
      window.history.replaceState({}, "", "/billing");
    }
  }, [refresh]);

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
          name: "Tierce Voice AI",
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

  async function handleStripe(packId: string) {
    setPurchasing(packId);
    try {
      const { checkout_url } = await createStripeCheckout(packId);
      window.location.href = checkout_url;
    } catch {
      toast.error("Could not create checkout session");
      setPurchasing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const currentPacks = packs ? (currency === "inr" ? packs.inr : packs.usd) : {};

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-indigo-400" />
          <h1 className="text-2xl font-semibold text-white">Billing</h1>
        </div>
        <button
          onClick={refresh}
          className="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Trial callout — buying any pack unlocks numbers */}
      {isTrial && (
        <div className="bg-gradient-to-r from-indigo-600/15 via-purple-600/10 to-indigo-600/15 border border-indigo-500/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-600/20 border border-indigo-500/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">
                Buy any pack to unlock dedicated phone numbers
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                You&apos;re on the free trial — your agents make outbound calls using Tierce&apos;s shared number.
                Once you buy any pack below, you can purchase your own dedicated number for inbound calls and branded caller ID.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance card */}
      <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-indigo-300 mb-1">Available Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-white">
                {balance != null ? balance.toFixed(1) : "—"}
              </span>
              <span className="text-lg text-indigo-300">minutes</span>
            </div>
            {balance != null && balance <= 5 && balance > 0 && (
              <p className="mt-2 text-sm text-yellow-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Low balance — top up to keep making calls
              </p>
            )}
            {balance != null && balance <= 0 && (
              <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> No balance — calls are blocked until you top up
              </p>
            )}
          </div>
          <TrendingUp className="w-10 h-10 text-indigo-400/40" />
        </div>
        <div className="mt-4 pt-4 border-t border-indigo-500/20 text-xs text-indigo-300/70">
          Free trial: 20 minutes on signup &nbsp;·&nbsp; Pay-as-you-go: ₹10/min (INR) or $0.12/min (USD)
        </div>
      </div>

      {/* Currency toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 mr-2">Buy credits in:</span>
        <button
          onClick={() => setCurrency("inr")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
            currency === "inr"
              ? "bg-indigo-600 border-indigo-500 text-white"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          <IndianRupee className="w-3.5 h-3.5" /> INR (Razorpay)
        </button>
        <button
          onClick={() => setCurrency("usd")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
            currency === "usd"
              ? "bg-indigo-600 border-indigo-500 text-white"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          <Globe className="w-3.5 h-3.5" /> USD (Stripe)
        </button>
      </div>

      {/* Packs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(currentPacks).map(([packId, pack]) => {
          const price = currency === "inr" ? pack.price_inr : pack.price_usd;
          const symbol = currency === "inr" ? "₹" : "$";
          const perMin = price != null ? (price / pack.minutes).toFixed(2) : null;
          const isPopular = packId === "growth";
          const isBuying = purchasing === packId;

          return (
            <div
              key={packId}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                isPopular
                  ? "border-indigo-500/60 bg-indigo-600/10"
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
              }`}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-semibold bg-indigo-600 text-white px-3 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">{pack.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{pack.minutes} minutes</p>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-bold text-white">{symbol}{price}</span>
              </div>
              {perMin && (
                <p className="text-xs text-gray-500 mb-2">{symbol}{perMin}/min</p>
              )}
              <div className="flex items-center gap-1 text-xs text-emerald-400 mb-3">
                <Phone className="w-3 h-3" />
                Unlocks dedicated phone numbers
              </div>
              <button
                onClick={() => currency === "inr" ? handleRazorpay(packId, pack) : handleStripe(packId)}
                disabled={isBuying}
                className={`mt-auto w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isPopular
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
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
        <h2 className="text-lg font-semibold text-white mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-gray-800/40 rounded-xl border border-gray-700">
            No transactions yet
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-4 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3"
              >
                <div className="flex-shrink-0">
                  {TX_ICONS[tx.type] ?? <CreditCard className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{tx.description || tx.type}</p>
                  <p className="text-xs text-gray-500">{fmtDate(tx.created_at)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-medium ${tx.minutes >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {tx.minutes >= 0 ? "+" : ""}{fmtMins(tx.minutes)}
                  </p>
                  {tx.amount_paid != null && (
                    <p className="text-xs text-gray-500">
                      {tx.currency === "INR" ? "₹" : "$"}{tx.amount_paid}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 w-20">
                  <p className="text-xs text-gray-400">{tx.balance_after.toFixed(1)} min</p>
                  <p className="text-xs text-gray-600">balance</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
