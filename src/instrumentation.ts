/**
 * F084 — revive the parseEnv() boot guards. `parseEnv` (src/lib/env.ts) fails fast on an invalid or
 * misconfigured environment: the LIVE-key-outside-production refusal, the production
 * TOSS_WEBHOOK_SECRET / MYPAGE_ACCESS_SECRET requirements, and the VERCEL_ENV↔APP_ENV cross-check
 * (a Vercel prod box that forgot APP_ENV=production). Those guards were dead code — `parseEnv` had no
 * runtime call site — so a misconfigured production boot succeeded silently. This Next.js
 * instrumentation hook runs it once at server startup, turning a bad prod config into a fail-fast
 * refusal (G-ERR) instead of a silently-degraded deploy.
 *
 * Guarded to the Node.js server runtime: env validation is a node-server concern, and the dynamic
 * import keeps `src/lib/env` (and its transitive deps) out of any edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { parseEnv } = await import("./lib/env");
  parseEnv(); // throws on invalid / misconfigured env → fail-fast boot
}
