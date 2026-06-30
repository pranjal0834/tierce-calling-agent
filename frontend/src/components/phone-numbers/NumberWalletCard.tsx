"use client";
import React, { useEffect, useState } from "react";
import { Wallet, Plus, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { getBillingBalance, createNumberWalletOrder, topupNumberWallet } from "@/lib/api";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const PRESETS = [300, 500, 1000, 2500];

export default function NumberWalletCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [price, setPrice] = useState(300);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  async function refresh() {
    try {
      const b = await getBillingBalance();
      setBalance(b?.number_balance_inr ?? 0);
      if (b?.number_price_inr) setPrice(b.number_price_inr);
    } catch { /* ignore */ }
  }
  useEffect(() => { refresh(); }, []);

  async function topup(amount: number) {
    setBusy(amount);
    try {
      const order = await createNumberWalletOrder(amount);
      if (order.mock) {
        const r = await topupNumberWallet({ amount_inr: amount });
        setBalance(r.number_balance_inr);
        toast.success(`₹${amount} added to your number wallet`);
        setOpen(false);
        return;
      }
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Could not load Razorpay. Please try again."); return; }
      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: "INR",
          name: "Vaaniq Voice",
          description: `Number wallet top-up · ₹${amount}`,
          order_id: order.order_id,
          handler: async (response: any) => {
            try {
              const r = await topupNumberWallet({
                amount_inr: amount,
                razorpay_order_id: order.order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setBalance(r.number_balance_inr);
              toast.success(`₹${amount} added to your number wallet`);
              setOpen(false);
              resolve();
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
          theme: { color: "#0B8A8F" },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e?.message !== "dismissed") toast.error("Top-up failed");
    } finally {
      setBusy(null);
    }
  }

  const months = balance != null && price > 0 ? Math.floor(balance / price) : 0;

  return (
    <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-brand-500/10 border border-brand-500/25 rounded-xl flex items-center justify-center shrink-0">
            <Wallet className="icon-lg text-brand-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Number Wallet</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Funds monthly number renewals (₹{price}/number). Separate from your call credits.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-lg font-semibold text-neutral-900 leading-none">
              {balance == null ? "—" : `₹${balance.toFixed(0)}`}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {balance == null ? "" : months > 0 ? `≈ ${months} renewal${months === 1 ? "" : "s"}` : "Top up to enable auto-renew"}
            </p>
          </div>
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 h-9 px-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors"
          >
            <Plus className="icon-sm" /> Top up
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-medium text-neutral-600">Choose an amount to add (paid via Razorpay)</p>
            <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700"><X className="icon-sm" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map(amt => (
              <button
                key={amt}
                onClick={() => topup(amt)}
                disabled={busy != null}
                className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-neutral-200 hover:border-brand-300 hover:bg-brand-50 text-sm font-semibold text-neutral-800 transition-colors disabled:opacity-50"
              >
                {busy === amt ? <RefreshCw className="icon-xs animate-spin" /> : null}
                ₹{amt}
                <span className="text-[11px] font-normal text-neutral-400">· {Math.floor(amt / price)}mo</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
