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
    // Same seam for Storage: blank SUPABASE_* so putObject stays a no-op ({stored:false}) and
    // photo-upload E2E never depends on a live Supabase project (storage.ts documents E2E as
    // the SUPABASE_*-absent path; a local .env.local was leaking real creds in — and when that
    // project got paused/deleted the upload specs broke with no code change). Live storage is
    // eval S11's job, not the hermetic suite's.
    // BIZ_REG_NO is a deterministic F064 fixture: with it set, legal-footer.spec.ts can assert
    // the 공정위 사업자정보확인 link renders; the other BIZ_* stay unset to assert placeholders.
    env: {
      ...process.env,
      DATABASE_URL: "",
      DIRECT_URL: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_STORAGE_BUCKET: "",
      BIZ_REG_NO: "123-45-67890",
      // F074 — the hermetic buyer/admin login helpers rely on the deterministic OTP 424242 + the
      // DEV_ADMIN_RE / kakao-sandbox shortcuts, which are now fail-closed behind this opt-in.
      ALLOW_DEV_AUTH: "true",
    },
  },
});
