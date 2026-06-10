import { defineConfig, devices } from "@playwright/test";

// E2E is the gate that stops false completion (T1-A): unit tests alone don't
// prove the user-facing flow works. Boots the dev server, traces on retry.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Hermetic E2E: force the in-memory order store even when a local .env.local sets a real
    // DATABASE_URL (Supabase). next dev keeps a present-but-empty value over .env.local, and
    // orders.ts treats a falsy DATABASE_URL as "no DB" → in-memory (ord_ ids) — so the suite is
    // hermetic and never writes to the real DB. (orders.ts:356 keys off process.env.DATABASE_URL.)
    env: { ...process.env, DATABASE_URL: "", DIRECT_URL: "" },
  },
});
