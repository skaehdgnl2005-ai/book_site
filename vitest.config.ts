import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // F074 — hermetic units exercise the dev-auth shortcuts (deterministic OTP, DEV_ADMIN_RE,
    // kakao sandbox) via process.env defaults; opt them in here. Tests asserting the fail-closed
    // (flag-absent) path pass EXPLICIT env dicts without it, so this global default never masks them.
    env: { ALLOW_DEV_AUTH: "true" },
  },
});
