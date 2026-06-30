"use client";
import React from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize    = "sm" | "md" | "lg";

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white border border-brand-600/20 hover:bg-brand-600 shadow-xs hover:shadow-brand/20 active:scale-[0.98]",
  secondary:
    "bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-150 hover:border-neutral-300 active:scale-[0.98]",
  ghost:
    "bg-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 active:scale-[0.98]",
  danger:
    "bg-error-500 text-white border border-error-600/20 hover:bg-error-600 shadow-xs active:scale-[0.98]",
  outline:
    "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 shadow-xs active:scale-[0.98]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8  px-3    text-xs  gap-1.5 rounded-lg",
  md: "h-9  px-4    text-sm  gap-2   rounded-lg",
  lg: "h-10 px-5    text-sm  gap-2   rounded-xl",
};

export default function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconRight,
  className = "",
  type = "button",
  fullWidth = false,
}: ButtonProps) {
  const base = [
    "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-1 select-none",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? "w-full" : "",
    disabled || loading ? "opacity-50 pointer-events-none" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${className}`.trim()}
    >
      {loading ? (
        <Loader2 className="icon-xs animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {!loading && iconRight && (
        <span className="flex-shrink-0">{iconRight}</span>
      )}
    </button>
  );
}
