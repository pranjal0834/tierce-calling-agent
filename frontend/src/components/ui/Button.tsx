// src/components/ui/Button.tsx
"use client";
import React from "react";

// Button props definition
type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  type?: "button" | "submit" | "reset";
};

// Simple variant to Tailwind class mapping
const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-teal-500 border border-teal-600 text-white hover:bg-teal-600",
  secondary: "bg-gray-200 border border-gray-300 text-gray-800 hover:bg-gray-300",
  danger: "bg-red-500 border border-red-600 text-white hover:bg-red-600",
};

export default function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
}: ButtonProps) {
  const base = `${variantClasses[variant]} px-3 py-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500`;
  return (
    <button type={type} onClick={onClick} className={`${base} ${className}`.trim()}>
      {children}
    </button>
  );
}
