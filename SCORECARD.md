# Harness **Readiness** Scorecard — Storybook Shop

> ⚠️ **This is a HARNESS-READINESS score, not project health.** It measures the machinery
> (instructions, tools, environment, state, feedback), **not** how much of the store is built.
> A high number here with an unbuilt store is expected and honest. Always read it next to
> **product delivery** (`pnpm status`) and real task success (rubric G1). Don't optimize this
> number in place of shipping features (Goodhart).

| Metric | Value | Means |
|---|:--:|---|
| **Harness readiness** (this card) | **85.2 / 100 → READY** | the scaffolding is ready for the coding loop |
| **Product delivery** (`pnpm status`) | **~1 / 21 product features (~5%)** | the actual store is essentially not built yet |

**Rubric:** `docs/method/harness_engineering_rubric.md` · **Loop iteration:** 1 ·
**Target:** READY (≥80) · **Result:** **READY** · **Overall (harness): 85.2 / 100**
_(scale 0–3 per criterion; arithmetic recomputed & verified, 2026-06-01)_

## Hard gates — 8 / 8 PASS
| Gate | Status | Evidence |
|---|:--:|---|
| `G-SIMPLE` | ✅ PASS | Simplest skeleton first (0 feature code); single-deployable Next app; no multi-agent framework; worker≠checker is a pass, not a crew (ADR-0005). |
| `G-GROUND` | ✅ PASS | `passes:true` gated on real tool output (`pnpm check` + Playwright E2E); `init.sh` runs the real verify. |
| `G-TERM` | ✅ PASS | WIP=1; explicit done definition; budgets (p95<2s, step/cost); `blocked` + no-progress→escalate. |
| `G-ERR` | ✅ PASS | `parseEnv` fail-fast model-readable; `check-constraints` structured JSON; `traced()` captures+rethrows. |
| `G-HITL` | ✅ PASS | `requireApproval()` default-deny (tested) + `pnpm approve` + constraints **R3** + `docs/SAFETY.md`. |
| `G-SANDBOX` | ✅ PASS | Isolated docker DB (scoped user); env-only secrets; CI container, TEST keys; `pnpm check` needs no DB/secrets. |
| `G-EVAL` | ✅ PASS | Definitive pass/fail via `pnpm check` + E2E + feature verification; eval harness reports metrics. |
| `G-TRACE` | ✅ PASS | `observability.ts` one JSON line/step·tool·error (sessionId+durationMs); Playwright trace on retry. |

## Categories — all floors ≥ 0.60
| Cat | Weight | Per-criterion (0–3) | Fraction | Points |
|---|:--:|---|:--:|:--:|
| **A** Loop/control | 15 | A1 2 · A2 3 · A3 3 · A4 3 · A5 2 | 0.867 | **13.00** |
| **B** Tools/ACI | 16 | B1 3 · B2 3 · B3 3 · B4 2 · B5 3 · B6 2 | 0.889 | **14.22** |
| **C** Context eng | 15 | C1 3 · C2 3 · C3 3 · C4 2 · C5 2 · C6 3 | 0.889 | **13.33** |
| **D** Error recovery | 12 | D1 3 · D2 2 · D3 2 · D4 3 | 0.833 | **10.00** |
| **E** Safety ⚠️ | 12 | E1 3 · E2 3 · E3 3 · E4 2 · E5 3 | 0.933 | **11.20** |
| **F** State/memory | 8 | F1 3 · F2 3 · F3 3 | 1.000 | **8.00** |
| **G** Evaluation | 14 | G1 2 · G2 2 · G3 2 · G4 3 · G5 2 · G6 2 | 0.722 | **10.11** |
| **H** Observability/ops | 8 | H1 2 · H2 2 · H3 2 | 0.667 | **5.33** |
| | | | **Overall** | **85.20** |

## Verdict
```
gates_ok = true   ·   all_floors_ok = true   ·   80 ≤ 85.20 < 90
STATUS = READY        ✅ meets target (READY)
```
Safety (E = 0.933) and State (F = 1.0) are the strongest categories — required and held high
for a payments + PII (`regulated`) domain; `G-HITL`, `G-SANDBOX`, and category E were not
downgraded.

## Honesty of scoring
Scores are evidence-backed and deliberately conservative. Criteria whose implementation is
partial or pending (most of G/H, D2/D3, B4/B6, C4/C5, A1/A5, E4) are held at **2**; only
tested/complete harness capabilities earn **3**. Many features are intentionally
`passes:false` — initialization ≠ implementation.

## ROBUST (≥90) is gated on PRODUCT delivery, not more machinery
To prevent gaming the harness number, **ROBUST promotion additionally requires real product
delivery** — i.e. core buyer-flow features (F002–F008, F011) actually `passing`, not just a
higher rubric score. Today product delivery is ~5%, so ROBUST is not available regardless of
machinery polish. Cheapest *harness* upgrades, if later relevant (A5 → 3 was just done via the
R5 counter; H1/H2 → 3 by wiring traces to a sink; G1/G3 → 3 as graders run on real features),
are deliberately deferred — adding machinery past READY without shipping features is exactly
the "passing-for-the-sake-of-passing" the rubric warns against (`G-SIMPLE`).

## Reproduce
```bash
./init.sh            # install → pnpm check (green) → ready
pnpm test:e2e        # 2 passed (home render + mobile responsive)
pnpm constraints     # {"ok": true, "count": 0}
pnpm eval            # purchase-flow metrics (S1 graded; S2–S6 pending honestly)
```
