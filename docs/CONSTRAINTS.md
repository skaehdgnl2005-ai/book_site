# Constraints

Two kinds. **Tool-enforced** rules are not restated here (the tool is the constraint — T1-D);
this doc covers only what needs human/agent judgment.

## Enforced by tooling (do not duplicate as prose)
- Style/correctness → ESLint (`pnpm lint`), TypeScript strict (`pnpm typecheck`), Vitest.
- Architecture/safety rules → `scripts/check-constraints.mjs` (`pnpm constraints`):
  - **R1** no committed live payment keys (TossPayments `live_sk_`/`live_ck_`; legacy Stripe shapes also caught)
  - **R2** no `console.*(process.env …)` (secret/PII leak)
  - **R3** irreversible `src/` side-effects must call `requireApproval()`
- Add new architecture rules **there**, not here.

## Judgment constraints (not mechanically enforceable)
- **WIP = 1.** One feature at a time; verify before moving on.
- **Done = verified.** `passes:true` only after `pnpm check` green **and** the feature's E2E.
- **TossPayments test/sandbox** in dev; live actions via the approval gate (`docs/SAFETY.md`).
- **Minimize PII.** Collect only what an order needs; never log it (use `redact()`).
- **Prices in integer KRW won** (no minor unit — *not* cents); capture price at purchase time on `OrderItem.unitPriceWon`.
- **Positive framing** in instructions: say what to do ("use `untrusted()`"), not "don't".
- **Prefer a topic doc over a new rule.** Before adding to AGENTS.md, ask "does this belong
  in a `docs/` file or an executable check instead?"
