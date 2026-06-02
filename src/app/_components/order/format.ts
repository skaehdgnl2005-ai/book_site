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
