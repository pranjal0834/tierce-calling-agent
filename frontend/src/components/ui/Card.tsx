// src/components/ui/Card.tsx
"use client";
import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Card({ children, className = "" }: CardProps) {
  const base = "bg-white border border-gray-200 rounded-xl shadow-sm p-4";
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}
