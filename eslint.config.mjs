import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Flat config (ESLint 9). Lint is a verification tool, not a place to restate
// rules — "the tool is the constraint" (T1-D). Architecture rules that need
// project knowledge live in scripts/check-constraints.mjs instead.
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".worktrees/**", // sibling git worktrees (git-ignored via .git/info/exclude) carry their
      // own .next build + source; running `pnpm check` from the root must not reach into them.
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
