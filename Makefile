# Thin parity wrapper for the build-guide's `make check` pattern.
# Canonical entry point is `pnpm check` (GNU make is optional / absent on Windows).
.PHONY: check verify lint types test e2e constraints eval boot

check: ; pnpm check
verify: ; pnpm verify
lint: ; pnpm lint
types: ; pnpm typecheck
test: ; pnpm test
e2e: ; pnpm test:e2e
constraints: ; pnpm constraints
eval: ; pnpm eval
boot: ; ./init.sh
