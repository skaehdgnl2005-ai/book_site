# Clean-State Checklist (run before ending every session)

"Clean up later" means never. Run these 5 dimensions; entropy compounds otherwise.

- [ ] **Build** — `./init.sh` boots with no errors.
- [ ] **Test** — `pnpm check` is green (lint + typecheck + test + constraints) and any
      newly-touched feature's `pnpm test:e2e` passes.
- [ ] **Progress** — `PROGRESS.md` reflects the current *verified* state; `feature_list.json`
      `state`/`passes`/`evidence` are accurate (no optimistic `passes:true`).
- [ ] **Artifacts** — no stray/temp files; no secrets staged; `git status` is intentional.
- [ ] **Startup** — the next session can resume from `./init.sh` + `session-handoff.md` alone.

Then: `git commit` (descriptive) → update `PROGRESS.md` → write `session-handoff.md`.
