"use client";
import { useEffect, useRef, useCallback } from "react";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export default function ConfirmModal({
  open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel",
  variant = "danger", onConfirm, onCancel, children,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    confirmBtnRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onKeyDown]);

  if (!open) return null;

  const color = variant === "danger" ? "error" : "warning";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onCancel} />
      <div ref={dialogRef} className="relative bg-white rounded-xl shadow-modal w-full max-w-sm p-6 animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        <button onClick={onCancel} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${color === "error" ? "bg-error-50" : "bg-warning-50"}`}>
          <AlertTriangle className={`w-5 h-5 ${color === "error" ? "text-error-600" : "text-warning-600"}`} />
        </div>
        <h2 id="confirm-modal-title" className="text-lg font-semibold text-neutral-900 mb-1">{title}</h2>
        <p id="confirm-modal-message" className="text-sm text-neutral-500 mb-4">{message}</p>
        {children}
        <div className="flex items-center gap-2.5 justify-end mt-6">
          <button onClick={onCancel} className="h-9 px-4 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
            {cancelLabel}
          </button>
          <button ref={confirmBtnRef} onClick={onConfirm} className={`h-9 px-4 text-sm font-medium text-white rounded-lg transition-colors ${color === "error" ? "bg-error-600 hover:bg-error-700" : "bg-warning-600 hover:bg-warning-700"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
