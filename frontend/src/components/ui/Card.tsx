"use client";
import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
};

const paddingMap = {
  none: "",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

export default function Card({
  children,
  className = "",
  hover = false,
  padding = "md",
}: CardProps) {
  return (
    <div
      className={[
        "bg-white border border-neutral-200 rounded-xl shadow-card",
        hover ? "transition-shadow duration-150 hover:shadow-hover cursor-pointer" : "",
        paddingMap[padding],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
