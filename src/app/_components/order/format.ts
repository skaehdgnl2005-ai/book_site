/** Format KRW won as an integer with thousands separators (no minor unit). Client-safe (no deps). */
// Client-safe twin of the catalog's formatWon in templates.ts — kept separate so the client bundle
// never pulls in @/lib/db (which templates.ts imports dynamically).
export function formatWon(won: number): string {
  return won.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}
