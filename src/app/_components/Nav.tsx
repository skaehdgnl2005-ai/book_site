import { NavClient } from "./nav/NavClient";

// Top nav (Atelier Sans). Thin server wrapper — the interactive nav (BAG count from
// localStorage + the mobile drawer, F049) lives in the client component under ./nav/.
// Wordmark + category links; reused across all pages (built by F002).
// `overlay` (home only): transparent over the photo hero, on-dark text.
export function Nav({ overlay = false }: { overlay?: boolean }) {
  return <NavClient overlay={overlay} />;
}
