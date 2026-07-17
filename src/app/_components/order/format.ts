/** Format KRW won as an integer with thousands separators (no minor unit). Client-safe (no deps). */
// Client-safe twin of the catalog's formatWon in templates.ts — kept separate so the client bundle
// never pulls in @/lib/db (which templates.ts imports dynamically).
export function formatWon(won: number): string {
  return won.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

import type { CoverType } from "@/lib/cart";

/** Customer-facing cover labels (display layer; cart.ts stays label-free). */
export const COVER_LABEL: Record<CoverType, string> = {
  SOFT: "소프트커버",
  HARD: "하드커버",
};

/**
 * F070 — format an ISO instant as a KST (Asia/Seoul) wall-clock with an explicit label. Toss
 * deposit deadlines are KST; a naive slice of an ISO string shows UTC (9h early) once the value
 * has round-tripped through Prisma's `.toISOString()` — a wrong payment deadline for KR buyers
 * (worker≠checker F070). Uses Intl (full ICU in Node 20 / the browser) for a deterministic format.
 */
export function formatKstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} (KST)`;
}
