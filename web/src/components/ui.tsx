import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-clay-100 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {subtitle && <p className="mt-1 text-sm text-clay-700">{subtitle}</p>}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "bad" | "neutral" | "info";
  children: ReactNode;
}) {
  const tones = {
    good: "bg-emerald-100 text-emerald-800",
    bad: "bg-rose-100 text-rose-800",
    neutral: "bg-stone-100 text-stone-700",
    info: "bg-sky-100 text-sky-800",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
