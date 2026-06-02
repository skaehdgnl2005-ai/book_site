# TRACK-ORDER Funnel Implementation Plan (F007–F011, F019)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entry-line pre-pay order funnel — a client-side stepped wizard at `/order/[templateKey]` (정보 → 사진 → 커버&옵션 → 확인) that produces a populated `/cart`, all DB-free and hermetic.

**Architecture:** A server route resolves the template (hermetic seed-mirror), then renders a client `OrderWizard` (`useReducer`) whose steps drive a pure `src/lib/cart.ts` model persisted to `localStorage`. Photo upload runs through a `"use server"` action calling the F029 asset API. No DB writes; `Order`/`OrderItem`/`Asset` rows are checkout's job (F012+).

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript 5, Vitest (unit, Node env, `tests/unit/**`), Playwright (E2E, boots `pnpm dev`, **no DATABASE_URL**), CSS Modules over `globals.css` tokens.

**Spec:** [docs/superpowers/specs/2026-06-02-track-order-funnel-design.md](2026-06-02-track-order-funnel-design.md). Branch: `feat/order` (already created).

---

## File Structure

**New (owned by this track):**
- `src/lib/cart.ts` — pure cart model + `localStorage` adapter (zero upward imports).
- `src/app/order/[templateKey]/page.tsx` — server route; resolves template → `notFound()` or `<OrderWizard>`.
- `src/app/_components/order/OrderWizard.tsx` — client wizard (state, step nav, add-to-cart).
- `src/app/_components/order/personalization.ts` — pure validator + extra-var field/label specs.
- `src/app/_components/order/photo-action.ts` — `"use server"` photo upload (imports `@/lib/assets` only).
- `src/app/_components/order/steps/{InfoStep,PhotoStep,CoverStep,ReviewStep}.tsx` — step components.
- `src/app/_components/order/CartView.tsx` — client cart view (empty-state + totals).
- `src/app/_components/order/order.module.css` — Atelier Sans styles for the funnel + cart.
- `src/app/cart/page.tsx` — `/cart` route (thin server shell → `<CartView>`). *(scope deviation, ADR-0011)*
- `tests/e2e/{order-start,order-form,order-photo,order-cover,order-qr-addon,cart}.spec.ts`
- `tests/unit/cart.test.ts`, `tests/unit/order-personalization.test.ts`

**Modified (scope deviations — ratified in ADR-0011):**
- `src/app/_components/catalog/templates.ts` — add `extraVar` end-to-end + `getTemplateByKey`.
- `tests/unit/catalog.test.ts` — extraVar drift guard vs `prisma/seed.ts` + `getTemplateByKey` tests.
- `feature_list.json`, `PROGRESS.md`, `DECISIONS.md` — state, log, ADR.

**Shared contract pinned for all UI tasks** — testids: `order-wizard` (+ `data-step`), `order-name-input`, `order-gender-male`/`-female`, `order-extravar-label`/`-input`/`-male`/`-female`, `order-error-childName`/`-childGender`/`-extraVar`, `order-next`, `order-back`, `order-photo-input`/`-skip`/`-status`/`-error`, `order-cover-soft`/`-hard`, `order-line-price`, `order-qr-toggle`/`-note`, `order-review-summary`, `order-add-to-cart`, `cart`, `cart-line`/`-title`/`-cover`/`-person`, `cart-grand-total`, `cart-empty`, `cart-checkout`, `cart-qr`.

---

## Task 1: Extend the catalog loader — extraVar end-to-end + getTemplateByKey

Threads `extraVar` through the view model, the seed mirror, **and** the live-DB seam (the review's #1 major: the DB delegate + mapper currently drop it), and adds a single-key resolver mirroring the existing hermetic fallback.

**Files:**
- Modify: `src/app/_components/catalog/templates.ts`
- Modify: `tests/unit/catalog.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/catalog.test.ts`:

```ts
// (add to the existing imports at the top)
import { getTemplateByKey, type TemplateExtraVar } from "../../src/app/_components/catalog/templates";
import { ENTRY_TEMPLATES } from "../../prisma/seed";

// extraVar must be a single source of truth: the mirror must match prisma/seed.ts exactly,
// AND the live-DB seam must carry it (a DB-configured deploy must not silently drop it).
describe("catalog extraVar — drift guard vs prisma/seed.ts (no DATABASE_URL)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => delete process.env.DATABASE_URL);
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("every template's extraVar matches the seed source of truth", async () => {
    for (const seed of ENTRY_TEMPLATES) {
      const t = await getTemplateByKey(seed.key);
      expect(t, `missing template ${seed.key}`).not.toBeNull();
      expect(t!.extraVar).toBe(seed.extraVar);
    }
  });

  it("the mirror's set of extraVar values equals the seed's set (catches a new enum member)", () => {
    const seedSet = new Set(ENTRY_TEMPLATES.map((t) => t.extraVar));
    const mirrorSet = new Set<TemplateExtraVar>();
    // pull the mirror via getTemplateByKey for each seed key
    return Promise.all(ENTRY_TEMPLATES.map((s) => getTemplateByKey(s.key))).then((rows) => {
      for (const r of rows) mirrorSet.add(r!.extraVar);
      expect([...mirrorSet].sort()).toEqual([...seedSet].sort());
    });
  });
});

describe("getTemplateByKey — hermetic resolution (no DATABASE_URL)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => delete process.env.DATABASE_URL);
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("resolves a known key from the seed mirror", async () => {
    const t = await getTemplateByKey("birth");
    expect(t?.label).toBe("탄생");
    expect(t?.extraVar).toBe("BIRTHDATE");
  });
  it("resolves a NONE-extraVar template", async () => {
    expect((await getTemplateByKey("hundred_days"))?.extraVar).toBe("NONE");
  });
  it("returns null for an unknown key", async () => {
    expect(await getTemplateByKey("not-a-real-key")).toBeNull();
  });
});
```

Also extend the existing `readTemplatesFromDb` describe block with an extraVar round-trip — add this `it` inside `describe("readTemplatesFromDb — live-DB branch ...")`:

```ts
  it("maps extraVar from the DB row, defaulting a missing one to NONE", async () => {
    const fakeDb = {
      template: {
        findMany: async () => [
          { ...row("birth", "탄생", 1), extraVar: "BIRTHDATE" },
          row("hundred_days", "백일", 2), // no extraVar field → NONE
        ],
      },
    };
    const rows = await readTemplatesFromDb("ANNIVERSARY", fakeDb);
    expect(rows.find((r) => r.key === "birth")?.extraVar).toBe("BIRTHDATE");
    expect(rows.find((r) => r.key === "hundred_days")?.extraVar).toBe("NONE");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- catalog`
Expected: FAIL — `getTemplateByKey` is not exported; `extraVar` is not on `CatalogTemplate`.

- [ ] **Step 3: Implement the catalog extension** — edit `src/app/_components/catalog/templates.ts`:

(a) After `export type CatalogCategory = ...` add the union (a deliberate third copy — `templates.ts` must not import the seed runner; the new drift test keeps it honest):

```ts
/** Mirrors prisma/seed.ts TemplateExtraVar. Kept in sync by the catalog drift-guard unit test. */
export type TemplateExtraVar =
  | "NONE"
  | "BIRTHDATE"
  | "AGE"
  | "SCHOOL"
  | "FIRST_WORD"
  | "SIBLING_GENDER";
```

(b) Add `extraVar` to `CatalogTemplate` (after `category`):

```ts
export type CatalogTemplate = {
  key: string;
  category: CatalogCategory;
  extraVar: TemplateExtraVar;
  label: string;
  blurb: string;
  softPriceWon: number;
  hardPriceWon: number;
  heroImageUrl: string | null;
  sortOrder: number;
};
```

(c) Add `extraVar` to the `t()` factory + every `CATALOG` row:

```ts
const t = (
  category: CatalogCategory,
  key: string,
  label: string,
  blurb: string,
  extraVar: TemplateExtraVar,
  sortOrder: number,
): CatalogTemplate => ({
  category,
  key,
  extraVar,
  label,
  blurb,
  softPriceWon: SOFT_PRICE_WON,
  hardPriceWon: HARD_PRICE_WON,
  heroImageUrl: null,
  sortOrder,
});

const CATALOG: readonly CatalogTemplate[] = [
  t("ANNIVERSARY", "birth", "탄생", "세상에 처음 온 그날의 설렘을 한 권에 담아.", "BIRTHDATE", 1),
  t("ANNIVERSARY", "hundred_days", "백일", "백 일의 기다림 끝에 만난 작은 기적의 기록.", "NONE", 2),
  t("ANNIVERSARY", "first_birthday", "돌", "첫 번째 생일, 가장 빛나는 하루의 이야기.", "NONE", 3),
  t("ANNIVERSARY", "birthday", "생일", "해마다 자라는 아이를 위한 단 하나의 생일 책.", "AGE", 4),
  t("ANNIVERSARY", "admission", "입학", "새로운 시작 앞에 선 아이에게 건네는 응원.", "SCHOOL", 5),
  t("FIRST_MOMENT", "first_steps", "첫 걸음마", "처음 내디딘 한 걸음, 그 용기를 오래 간직하다.", "NONE", 6),
  t("FIRST_MOMENT", "first_word", "첫 말", "아이가 처음 부른 그 한마디로 시작되는 이야기.", "FIRST_WORD", 7),
  t("FIRST_MOMENT", "became_sibling", "형아 된 날", "동생을 맞이한 날, 한 뼘 더 자란 마음.", "SIBLING_GENDER", 8),
];
```

(d) Replace the `TemplateDelegate` type + `readTemplatesFromDb` body with a shared row type, a `findUnique`, and a `mapRow` helper:

```ts
/** A Template row as the DB/mirror exposes it. extraVar optional → defaults to NONE on map. */
type TemplateRow = {
  key: string;
  category: CatalogCategory;
  label: string;
  blurb: string;
  extraVar?: TemplateExtraVar | null;
  softPriceWon: number;
  hardPriceWon: number;
  heroImageUrl: string | null;
  sortOrder: number;
};

/** Minimal Prisma delegate surface we depend on — a generated client satisfies it. */
type TemplateDelegate = {
  findMany(args: {
    where: { category: CatalogCategory; active: boolean };
    orderBy: { sortOrder: "asc" };
  }): Promise<TemplateRow[]>;
  findUnique(args: { where: { key: string } }): Promise<TemplateRow | null>;
};

function mapRow(r: TemplateRow): CatalogTemplate {
  return {
    key: r.key,
    category: r.category,
    extraVar: r.extraVar ?? "NONE",
    label: r.label,
    blurb: r.blurb,
    softPriceWon: r.softPriceWon,
    hardPriceWon: r.hardPriceWon,
    heroImageUrl: r.heroImageUrl ?? null,
    sortOrder: r.sortOrder,
  };
}

export async function readTemplatesFromDb(
  category: CatalogCategory,
  db: { [model: string]: unknown },
): Promise<CatalogTemplate[]> {
  const rows = await (db.template as TemplateDelegate).findMany({
    where: { category, active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mapRow);
}
```

(e) Add `getTemplateByKey` after `getTemplatesByCategory` (mirrors its hermetic fallback exactly):

```ts
/**
 * Resolve a single template by its unique key. Mirrors getTemplatesByCategory's hermetic
 * fallback: optional live-DB read (dynamic @/lib/db import, inside try/catch), else the
 * seed mirror. Returns null only when the key is absent from BOTH — the route maps that
 * to notFound(). Keeps @prisma/client out of the hermetic render path.
 */
export async function getTemplateByKey(key: string): Promise<CatalogTemplate | null> {
  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import("@/lib/db");
      const row = await (((await getDb()).template) as TemplateDelegate).findUnique({
        where: { key },
      });
      if (row) return mapRow(row);
      // null row (migrated-but-unseeded) deliberately falls through to the mirror.
    } catch {
      // No generated client / unreachable DB (hermetic CI/E2E) — use the seed mirror.
    }
  }
  return CATALOG.find((x) => x.key === key) ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- catalog`
Expected: PASS (all catalog tests, incl. the existing F005/F006 ones — `extraVar` is additive).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/catalog/templates.ts tests/unit/catalog.test.ts
git commit -m "feat(F007): extend catalog loader with extraVar (DB seam + mirror) + getTemplateByKey"
```

---

## Task 2: Pure cart model — `src/lib/cart.ts`

**Files:**
- Create: `src/lib/cart.ts`
- Test: `tests/unit/cart.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/unit/cart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  emptyCart, lineTotalWon, grandTotalWon, addLine, removeLine, setQrAddon,
  orderName, toCheckoutSummary, QR_ADDON_WON, type Cart, type CartLine,
} from "../../src/lib/cart";

const line = (id: string, label: string, won: number): CartLine => ({
  id,
  templateKey: "first_birthday",
  templateLabel: label,
  coverType: won === 49000 ? "HARD" : "SOFT",
  unitPriceWon: won,
  personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
  photo: null,
});

describe("cart model", () => {
  it("an empty cart totals 0 and has no QR", () => {
    const c = emptyCart();
    expect(c.lines).toHaveLength(0);
    expect(c.qrVideoAddon).toBe(false);
    expect(grandTotalWon(c)).toBe(0);
  });

  it("sums line totals + QR (which is +0 today)", () => {
    let c = addLine(emptyCart(), line("a", "돌", 43000));
    c = addLine(c, line("b", "생일", 49000));
    expect(lineTotalWon(c.lines[0])).toBe(43000);
    expect(grandTotalWon(c)).toBe(92000);
    c = setQrAddon(c, true);
    expect(grandTotalWon(c)).toBe(92000 + QR_ADDON_WON); // QR_ADDON_WON === 0
    expect(QR_ADDON_WON).toBe(0);
  });

  it("removeLine drops only the matching id", () => {
    let c = addLine(addLine(emptyCart(), line("a", "돌", 43000)), line("b", "생일", 49000));
    c = removeLine(c, "a");
    expect(c.lines.map((l) => l.id)).toEqual(["b"]);
  });

  it("orderName reads '<label>' for one line and '<label> 외 N건' for more", () => {
    expect(orderName(addLine(emptyCart(), line("a", "돌", 43000)))).toBe("돌");
    const two = addLine(addLine(emptyCart(), line("a", "돌", 43000)), line("b", "생일", 49000));
    expect(orderName(two)).toBe("돌 외 1건");
  });

  it("toCheckoutSummary exposes amount, name, and count", () => {
    const c = addLine(emptyCart(), line("a", "돌", 43000));
    expect(toCheckoutSummary(c)).toEqual({ amountWon: 43000, orderName: "돌", lineCount: 1 });
  });

  it("pure ops never mutate the input cart", () => {
    const c = emptyCart();
    addLine(c, line("a", "돌", 43000));
    expect(c.lines).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- cart`
Expected: FAIL — cannot find module `../../src/lib/cart`.

- [ ] **Step 3: Implement** — `src/lib/cart.ts`:

```ts
/**
 * Pure cart model for the entry-line order funnel (F011) + a thin localStorage adapter.
 *
 * LAYERING: zero upward imports — no payments, no app-layer code. `kind` is stored as a
 * string (typed/validated in the order layer). Display formatting is the UI's job; these
 * fns return integer KRW won. The cart persists to localStorage so it survives client
 * navigation AND the Toss redirect round-trip (enables F016 "cart preserved").
 */
export type CoverType = "SOFT" | "HARD";
export type Gender = "MALE" | "FEMALE";
export type ExtraVarValue = { kind: string; value: string } | null;

export type CartLine = {
  id: string;
  templateKey: string; // durable handle — checkout resolves to Template.id
  templateLabel: string; // display only
  coverType: CoverType;
  unitPriceWon: number; // 43000 | 49000
  personalization: { childName: string; childGender: Gender; extraVar: ExtraVarValue };
  photo: { storageKey: string; contentType: string; byteSize: number } | null; // null = skipped
};

export type Cart = { lines: CartLine[]; qrVideoAddon: boolean }; // QR is ORDER-level (Order.qrVideoAddon)

/** TODO(pricing): brief lists QR as a paid add-on but states no price; schema has no QR price field (ADR-0011). */
export const QR_ADDON_WON = 0;

const STORAGE_KEY = "gpms.cart.v1";

export function emptyCart(): Cart {
  return { lines: [], qrVideoAddon: false };
}

export function lineTotalWon(line: CartLine): number {
  return line.unitPriceWon;
}

export function grandTotalWon(cart: Cart): number {
  const lines = cart.lines.reduce((sum, l) => sum + lineTotalWon(l), 0);
  return lines + (cart.qrVideoAddon ? QR_ADDON_WON : 0);
}

export function addLine(cart: Cart, line: CartLine): Cart {
  return { ...cart, lines: [...cart.lines, line] };
}

export function removeLine(cart: Cart, id: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== id) };
}

export function setQrAddon(cart: Cart, on: boolean): Cart {
  return { ...cart, qrVideoAddon: on };
}

export function orderName(cart: Cart): string {
  const [first, ...rest] = cart.lines;
  if (!first) return "그림책 제작소 주문";
  return rest.length === 0 ? first.templateLabel : `${first.templateLabel} 외 ${rest.length}건`;
}

export function toCheckoutSummary(cart: Cart): {
  amountWon: number;
  orderName: string;
  lineCount: number;
} {
  return { amountWon: grandTotalWon(cart), orderName: orderName(cart), lineCount: cart.lines.length };
}

// ── client persistence (SSR-safe: empty cart on the server) ──
export function loadCart(): Cart {
  if (typeof window === "undefined") return emptyCart();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCart();
    const parsed = JSON.parse(raw) as Partial<Cart>;
    if (!parsed || !Array.isArray(parsed.lines)) return emptyCart();
    return { lines: parsed.lines as CartLine[], qrVideoAddon: Boolean(parsed.qrVideoAddon) };
  } catch {
    return emptyCart();
  }
}

export function saveCart(cart: Cart): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

/** Empty + persist. Per the handoff contract, called ONLY after F013 PAID — never on checkout start. */
export function clearCart(): Cart {
  const empty = emptyCart();
  saveCart(empty);
  return empty;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- cart`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart.ts tests/unit/cart.test.ts
git commit -m "feat(F011): pure cart model + localStorage adapter (src/lib/cart.ts)"
```

---

## Task 3: Personalization validator — `personalization.ts`

**Files:**
- Create: `src/app/_components/order/personalization.ts`
- Test: `tests/unit/order-personalization.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/unit/order-personalization.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validatePersonalization, isValid, toExtraVarValue, EXTRA_VAR_SPECS,
  CHILD_GENDER_LABEL, CHILD_GENDER_LABEL_DEFAULT,
} from "../../src/app/_components/order/personalization";

const base = { childName: "도윤", childGender: "MALE", extraVarValue: "" };

describe("validatePersonalization", () => {
  it("requires a non-empty name and a gender", () => {
    const e = validatePersonalization({ childName: "  ", childGender: "", extraVarValue: "" }, "NONE");
    expect(e.childName).toBeDefined();
    expect(e.childGender).toBeDefined();
    expect(isValid(e)).toBe(false);
  });

  it("passes a NONE template with just name + gender", () => {
    expect(isValid(validatePersonalization(base, "NONE"))).toBe(true);
  });

  it("requires the extra-var when the template has one", () => {
    expect(validatePersonalization(base, "BIRTHDATE").extraVar).toBeDefined();
  });

  it("BIRTHDATE rejects a non-date and a future date", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "nope" }, "BIRTHDATE").extraVar).toBeDefined();
    expect(validatePersonalization({ ...base, extraVarValue: "2999-01-01" }, "BIRTHDATE").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "2024-01-15" }, "BIRTHDATE"))).toBe(true);
  });

  it("AGE accepts 1..12 integers only", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "0" }, "AGE").extraVar).toBeDefined();
    expect(validatePersonalization({ ...base, extraVarValue: "1.5" }, "AGE").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "1" }, "AGE"))).toBe(true);
  });

  it("SIBLING_GENDER accepts only MALE/FEMALE", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "x" }, "SIBLING_GENDER").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "FEMALE" }, "SIBLING_GENDER"))).toBe(true);
  });

  it("became_sibling labels its two gender fields distinctly", () => {
    expect(CHILD_GENDER_LABEL).not.toBe(EXTRA_VAR_SPECS.SIBLING_GENDER.label);
    expect(CHILD_GENDER_LABEL_DEFAULT).not.toBe(CHILD_GENDER_LABEL);
  });

  it("toExtraVarValue returns null for NONE and {kind,value} otherwise", () => {
    expect(toExtraVarValue("NONE", "x")).toBeNull();
    expect(toExtraVarValue("AGE", " 2 ")).toEqual({ kind: "AGE", value: "2" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- order-personalization`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/app/_components/order/personalization.ts`:

```ts
/**
 * Pure personalization validation for the pre-pay form (F008). All buyer input is
 * untrusted() at the call boundary (the wizard); this never trusts raw input. The
 * extra-var field + label are derived from the template's TemplateExtraVar.
 */
import type { TemplateExtraVar } from "../catalog/templates";
import type { ExtraVarValue } from "@/lib/cart";

export type ExtraVarSpec = {
  kind: Exclude<TemplateExtraVar, "NONE">;
  label: string;
  inputType: "text" | "date" | "number" | "gender";
};

export const EXTRA_VAR_SPECS: Record<Exclude<TemplateExtraVar, "NONE">, ExtraVarSpec> = {
  BIRTHDATE: { kind: "BIRTHDATE", label: "생년월일", inputType: "date" },
  AGE: { kind: "AGE", label: "몇 번째 생일인가요?", inputType: "number" },
  SCHOOL: { kind: "SCHOOL", label: "입학하는 곳", inputType: "text" },
  FIRST_WORD: { kind: "FIRST_WORD", label: "아이가 처음 한 말", inputType: "text" },
  SIBLING_GENDER: { kind: "SIBLING_GENDER", label: "새로 태어난 동생의 성별", inputType: "gender" },
};

// became_sibling renders TWO gender fields; distinct labels prevent swapping them.
export const CHILD_GENDER_LABEL = "우리 아이(형·누나가 될 아이) 성별";
export const CHILD_GENDER_LABEL_DEFAULT = "아이 성별";

export type RawPersonalization = {
  childName: string;
  childGender: string;
  extraVarValue: string;
};
export type PersonalizationErrors = Partial<
  Record<"childName" | "childGender" | "extraVar", string>
>;

const NAME_MAX = 40;
const TEXT_MAX = 60;

export function validatePersonalization(
  raw: RawPersonalization,
  extraVar: TemplateExtraVar,
): PersonalizationErrors {
  const errors: PersonalizationErrors = {};
  const name = raw.childName.trim();
  if (name.length === 0) errors.childName = "아이 이름을 입력해 주세요.";
  else if (name.length > NAME_MAX) errors.childName = `이름은 ${NAME_MAX}자 이내로 입력해 주세요.`;

  if (raw.childGender !== "MALE" && raw.childGender !== "FEMALE")
    errors.childGender = "성별을 선택해 주세요.";

  if (extraVar !== "NONE") {
    const v = raw.extraVarValue.trim();
    if (v.length === 0) {
      errors.extraVar = "필수 항목을 입력해 주세요.";
    } else if (extraVar === "BIRTHDATE") {
      const ms = Date.parse(v);
      if (Number.isNaN(ms)) errors.extraVar = "올바른 날짜를 입력해 주세요.";
      else if (ms > Date.now()) errors.extraVar = "미래 날짜는 입력할 수 없습니다.";
    } else if (extraVar === "AGE") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 12)
        errors.extraVar = "1에서 12 사이의 숫자를 입력해 주세요.";
    } else if (extraVar === "SIBLING_GENDER") {
      if (v !== "MALE" && v !== "FEMALE") errors.extraVar = "동생의 성별을 선택해 주세요.";
    } else if (v.length > TEXT_MAX) {
      errors.extraVar = `${TEXT_MAX}자 이내로 입력해 주세요.`;
    }
  }
  return errors;
}

export function isValid(errors: PersonalizationErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Build the typed ExtraVarValue for the cart from validated raw input. */
export function toExtraVarValue(extraVar: TemplateExtraVar, raw: string): ExtraVarValue {
  return extraVar === "NONE" ? null : { kind: extraVar, value: raw.trim() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- order-personalization`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/order/personalization.ts tests/unit/order-personalization.test.ts
git commit -m "feat(F008): pure personalization validator + extra-var field specs"
```

---

## Task 4: Order route + wizard + InfoStep (F007 start, F008 form)

**Files:**
- Create: `src/app/order/[templateKey]/page.tsx`
- Create: `src/app/_components/order/OrderWizard.tsx`
- Create: `src/app/_components/order/order.module.css`
- Create: `src/app/_components/order/steps/InfoStep.tsx`
- Create: `src/app/_components/order/steps/PhotoStep.tsx` (stub now; filled in Task 5)
- Create: `src/app/_components/order/steps/CoverStep.tsx` (stub now; filled in Task 6)
- Create: `src/app/_components/order/steps/ReviewStep.tsx` (stub now; filled in Task 7)
- Create: `src/app/_components/order/photo-action.ts`
- Test: `tests/e2e/order-start.spec.ts`, `tests/e2e/order-form.spec.ts`

> Stub steps are created here so the wizard compiles; Tasks 5–7 replace their bodies. Each
> stub renders its `data-step` marker + a 다음/뒤로 so navigation works for earlier specs.

- [ ] **Step 1: Write the failing E2E specs** — `tests/e2e/order-start.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// F007 — template select starts the flow; the correct extra-var field (0~1) is resolved
// per template. Hermetic: /order/<key> resolves via the seed mirror (no DB in E2E).
test.describe("order start — extra-var resolved per template (F007)", () => {
  test("birth (탄생) requests 생년월일 on the info step", async ({ page }) => {
    await page.goto("/order/birth");
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "info");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("생년월일");
  });

  test("hundred_days (백일) requests NO extra-var field", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await expect(page.getByTestId("order-wizard")).toBeVisible();
    await expect(page.getByTestId("order-extravar-label")).toHaveCount(0);
  });

  test("became_sibling requests the sibling gender with a distinct label", async ({ page }) => {
    await page.goto("/order/became_sibling");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("새로 태어난 동생의 성별");
  });

  test("an unknown template key is a 404", async ({ page }) => {
    const res = await page.goto("/order/not-a-real-key");
    expect(res?.status()).toBe(404);
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/order/birth");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
```

`tests/e2e/order-form.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// F008 — pre-pay minimal form: 아동 이름·성별 + template var (0~1), validated; errors block 다음.
test.describe("order form — validation (F008)", () => {
  test("empty required fields block progress with clear errors", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-error-childName")).toBeVisible();
    await expect(page.getByTestId("order-error-childGender")).toBeVisible();
    await expect(page.getByTestId("order-error-extraVar")).toBeVisible();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "info");
  });

  test("valid input advances to the photo step", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
  });

  test("a no-extra-var template (백일) validates with just 이름·성별", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await page.getByTestId("order-name-input").fill("서아");
    await page.getByTestId("order-gender-female").check();
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
  });

  test("became_sibling shows two distinct gender labels", async ({ page }) => {
    await page.goto("/order/became_sibling");
    await expect(page.getByText("우리 아이(형·누나가 될 아이) 성별")).toBeVisible();
    await expect(page.getByText("새로 태어난 동생의 성별")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:e2e -- order-start.spec.ts order-form.spec.ts`
Expected: FAIL — `/order/birth` 404s (route absent).

- [ ] **Step 3: Create the CSS module** — `src/app/_components/order/order.module.css`:

```css
/* order funnel + cart — Atelier Sans. Tokens only (R6: no box-shadow; R7: no #fff/#000).
   Radius 0; depth = tone steps + 1px --line hairlines; serif reserved for book titles. */
.wizard { padding: var(--space-lg) 0; max-width: 640px; }
.step { display: flex; flex-direction: column; gap: var(--space-md); }

.field { display: flex; flex-direction: column; gap: var(--space-xs); border: 0; margin: 0; padding: 0; }
.label {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.78rem;
  letter-spacing: 0.04em; color: var(--ink);
}
.input {
  font-family: var(--font-sans); font-size: 1rem; color: var(--ink);
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 0.7em 0.9em;
}
.input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.error { margin: 0; font-size: 0.82rem; color: var(--accent); }

.choices { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
.choice {
  display: inline-flex; align-items: baseline; gap: var(--space-xs);
  padding: 0.8em 1em; border: 1px solid var(--line); background: var(--surface);
  font-family: var(--font-grotesk); font-size: 0.9rem; cursor: pointer;
}
.choiceActive { border-color: var(--accent); color: var(--accent); }
.choicePrice { font-size: 0.78rem; color: var(--muted); }

.linePrice {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 1.1rem; color: var(--ink);
  padding-top: var(--space-sm); border-top: 1px solid var(--line);
}
.qrRow { display: flex; align-items: flex-start; gap: var(--space-sm); }
.qrNote { margin: 0; font-size: 0.82rem; color: var(--muted); }
.photoStatus { margin: 0; font-family: var(--font-grotesk); font-size: 0.9rem; color: var(--accent); }

.summary {
  display: flex; flex-direction: column; gap: var(--space-xs);
  padding: var(--space-md); border: 1px solid var(--line); background: var(--surface);
}
.summaryTitle { font-family: var(--font-serif-ko); font-size: 1.2rem; color: var(--ink); }
.summaryRow { display: flex; justify-content: space-between; gap: var(--space-sm); font-size: 0.92rem; color: var(--grey); }

.nav { display: flex; justify-content: space-between; gap: var(--space-sm); margin-top: var(--space-md); }
.navGroup { display: flex; gap: var(--space-sm); }
.back {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.78rem; letter-spacing: 0.08em;
  background: transparent; border: 1px solid var(--line); color: var(--ink);
  padding: 1.05em 2.2em; cursor: pointer;
}

/* cart */
.cart { padding: var(--space-lg) 0; max-width: 720px; }
.cartLine {
  display: flex; flex-direction: column; gap: var(--space-xs);
  padding: var(--space-md) 0; border-bottom: 1px solid var(--line);
}
.cartLineTitle { font-family: var(--font-serif-ko); font-size: 1.25rem; color: var(--ink); }
.cartLineMeta { font-size: 0.9rem; color: var(--grey); }
.cartTotals {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--line);
}
.grandTotal { font-family: var(--font-grotesk); font-weight: 700; font-size: 1.3rem; color: var(--ink); }
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--space-md); padding: var(--space-xl) 0; color: var(--grey); }
.qrTag { margin: var(--space-sm) 0 0; font-size: 0.82rem; color: var(--muted); }
```

- [ ] **Step 4: Create the photo server action** — `src/app/_components/order/photo-action.ts`:

```ts
"use server";

import { receiveUpload, storeAsset } from "@/lib/assets";

export type PhotoResult =
  | { ok: true; photo: { storageKey: string; contentType: string; byteSize: number } }
  | { ok: false; error: string };

/**
 * F009 — validate + store an access-controlled child-photo descriptor (F029 path).
 * PII-safe: never echoes the filename. Durable byte storage is downstream (mypage F017).
 */
export async function uploadChildPhoto(formData: FormData): Promise<PhotoResult> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "사진 파일을 선택해 주세요." };
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = receiveUpload({ filename: file.name, contentType: file.type, bytes });
    const stored = storeAsset("CHILD_PHOTO", upload);
    return {
      ok: true,
      photo: {
        storageKey: stored.storageKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
      },
    };
  } catch {
    return {
      ok: false,
      error: "지원하지 않는 형식입니다. JPG·PNG·WEBP·HEIC 이미지를 올려 주세요.",
    };
  }
}
```

- [ ] **Step 5: Create step stubs** — `src/app/_components/order/steps/PhotoStep.tsx`:

```tsx
"use client";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function PhotoStep({ onNext, onBack }: { draft: Draft; onPatch: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className={styles.step}>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
```

`src/app/_components/order/steps/CoverStep.tsx`:

```tsx
"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function CoverStep({ onNext, onBack }: { template: CatalogTemplate; draft: Draft; unitPriceWon: number; onPatch: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className={styles.step}>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
```

`src/app/_components/order/steps/ReviewStep.tsx`:

```tsx
"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function ReviewStep({ onBack, onAddToCart }: { template: CatalogTemplate; draft: Draft; unitPriceWon: number; onBack: () => void; onAddToCart: () => void }) {
  return (
    <div className={styles.step}>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-add-to-cart" onClick={onAddToCart}>장바구니에 담기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the wizard** — `src/app/_components/order/OrderWizard.tsx`:

```tsx
"use client";
import { useReducer } from "react";
import { useRouter } from "next/navigation";
import type { CatalogTemplate } from "../catalog/templates";
import { Nav } from "../Nav";
import { Footer } from "../Footer";
import { loadCart, saveCart, addLine, setQrAddon, type CartLine, type CoverType, type Gender } from "@/lib/cart";
import { toExtraVarValue } from "./personalization";
import { InfoStep } from "./steps/InfoStep";
import { PhotoStep } from "./steps/PhotoStep";
import { CoverStep } from "./steps/CoverStep";
import { ReviewStep } from "./steps/ReviewStep";
import styles from "./order.module.css";

export type Draft = {
  childName: string;
  childGender: "" | Gender;
  extraVarValue: string;
  photo: { storageKey: string; contentType: string; byteSize: number } | null;
  coverType: CoverType;
  qrVideoAddon: boolean;
};

const STEPS = ["info", "photo", "cover", "review"] as const;
type State = { stepIndex: number; draft: Draft };
type Action = { type: "PATCH"; patch: Partial<Draft> } | { type: "NEXT" } | { type: "BACK" };

const initialDraft: Draft = {
  childName: "", childGender: "", extraVarValue: "", photo: null, coverType: "SOFT", qrVideoAddon: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "PATCH": return { ...state, draft: { ...state.draft, ...action.patch } };
    case "NEXT": return { ...state, stepIndex: Math.min(state.stepIndex + 1, STEPS.length - 1) };
    case "BACK": return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
    default: return state;
  }
}

export function OrderWizard({ template }: { template: CatalogTemplate }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { stepIndex: 0, draft: initialDraft });
  const step = STEPS[state.stepIndex];
  const patch = (p: Partial<Draft>) => dispatch({ type: "PATCH", patch: p });
  const next = () => dispatch({ type: "NEXT" });
  const back = () => dispatch({ type: "BACK" });
  const unitPriceWon = state.draft.coverType === "HARD" ? template.hardPriceWon : template.softPriceWon;

  const addToCart = () => {
    const line: CartLine = {
      id: crypto.randomUUID(),
      templateKey: template.key,
      templateLabel: template.label,
      coverType: state.draft.coverType,
      unitPriceWon,
      personalization: {
        childName: state.draft.childName.trim(),
        childGender: state.draft.childGender as Gender,
        extraVar: toExtraVarValue(template.extraVar, state.draft.extraVarValue),
      },
      photo: state.draft.photo,
    };
    let cart = addLine(loadCart(), line);
    cart = setQrAddon(cart, state.draft.qrVideoAddon);
    saveCart(cart);
    router.push("/cart");
  };

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="order-title">
          <p className="eyebrow">{template.label}</p>
          <h1 className="hero__title" id="order-title">주문 만들기</h1>
        </section>
        <section className={styles.wizard} data-testid="order-wizard" data-step={step} aria-label="주문 단계">
          {step === "info" && <InfoStep template={template} draft={state.draft} onPatch={patch} onNext={next} />}
          {step === "photo" && <PhotoStep draft={state.draft} onPatch={patch} onNext={next} onBack={back} />}
          {step === "cover" && <CoverStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onPatch={patch} onNext={next} onBack={back} />}
          {step === "review" && <ReviewStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onBack={back} onAddToCart={addToCart} />}
        </section>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 7: Create the InfoStep** — `src/app/_components/order/steps/InfoStep.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import {
  validatePersonalization, isValid, EXTRA_VAR_SPECS,
  CHILD_GENDER_LABEL, CHILD_GENDER_LABEL_DEFAULT, type PersonalizationErrors,
} from "../personalization";
import styles from "../order.module.css";

export function InfoStep({
  template, draft, onPatch, onNext,
}: {
  template: CatalogTemplate;
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  const [errors, setErrors] = useState<PersonalizationErrors>({});
  const spec = template.extraVar === "NONE" ? null : EXTRA_VAR_SPECS[template.extraVar];
  const isSibling = template.extraVar === "SIBLING_GENDER";
  const childGenderLabel = isSibling ? CHILD_GENDER_LABEL : CHILD_GENDER_LABEL_DEFAULT;

  const submit = () => {
    const errs = validatePersonalization(
      { childName: draft.childName, childGender: draft.childGender, extraVarValue: draft.extraVarValue },
      template.extraVar,
    );
    setErrors(errs);
    if (isValid(errs)) onNext();
  };

  return (
    <div className={styles.step}>
      <label className={styles.field}>
        <span className={styles.label}>아이 이름</span>
        <input className={styles.input} data-testid="order-name-input" value={draft.childName}
          onChange={(e) => onPatch({ childName: e.target.value })} />
      </label>
      {errors.childName && <p className={styles.error} data-testid="order-error-childName">{errors.childName}</p>}

      <fieldset className={styles.field}>
        <legend className={styles.label}>{childGenderLabel}</legend>
        <label><input type="radio" name="childGender" data-testid="order-gender-male"
          checked={draft.childGender === "MALE"} onChange={() => onPatch({ childGender: "MALE" })} /> 남아</label>
        <label><input type="radio" name="childGender" data-testid="order-gender-female"
          checked={draft.childGender === "FEMALE"} onChange={() => onPatch({ childGender: "FEMALE" })} /> 여아</label>
      </fieldset>
      {errors.childGender && <p className={styles.error} data-testid="order-error-childGender">{errors.childGender}</p>}

      {spec && (
        <div className={styles.field}>
          <span className={styles.label} data-testid="order-extravar-label">{spec.label}</span>
          {spec.inputType === "gender" ? (
            <fieldset>
              <label><input type="radio" name="extraVar" data-testid="order-extravar-male"
                checked={draft.extraVarValue === "MALE"} onChange={() => onPatch({ extraVarValue: "MALE" })} /> 남아</label>
              <label><input type="radio" name="extraVar" data-testid="order-extravar-female"
                checked={draft.extraVarValue === "FEMALE"} onChange={() => onPatch({ extraVarValue: "FEMALE" })} /> 여아</label>
            </fieldset>
          ) : (
            <input className={styles.input} data-testid="order-extravar-input"
              type={spec.inputType === "date" ? "date" : spec.inputType === "number" ? "number" : "text"}
              value={draft.extraVarValue} onChange={(e) => onPatch({ extraVarValue: e.target.value })} />
          )}
        </div>
      )}
      {errors.extraVar && <p className={styles.error} data-testid="order-error-extraVar">{errors.extraVar}</p>}

      <button className="cta" type="button" data-testid="order-next" onClick={submit}>다음</button>
    </div>
  );
}
```

> Note: for `SIBLING_GENDER`, validation requires `MALE`/`FEMALE`; the gender radios set
> `extraVarValue` to those literals — `order-extravar-input` is absent for that template, so
> the `order-form` test for `birth` (date input) and the `order-start` test for `became_sibling`
> (label only) both hold.

- [ ] **Step 8: Create the route** — `src/app/order/[templateKey]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTemplateByKey } from "../../_components/catalog/templates";
import { OrderWizard } from "../../_components/order/OrderWizard";

export const metadata: Metadata = { title: "주문 만들기 · 그림책 제작소" };
// Render per request so the live-DB read (when configured) is honored; hermetic builds use the mirror.
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ templateKey: string }>;
}) {
  const { templateKey } = await params;
  const template = await getTemplateByKey(templateKey);
  if (!template) notFound();
  return <OrderWizard template={template} />;
}
```

- [ ] **Step 9: Run the E2E specs to verify they pass**

Run: `pnpm test:e2e -- order-start.spec.ts order-form.spec.ts`
Expected: PASS (5 + 4 tests).

- [ ] **Step 10: Commit**

```bash
git add src/app/order src/app/_components/order tests/e2e/order-start.spec.ts tests/e2e/order-form.spec.ts
git commit -m "feat(F007,F008): order route + wizard + validated pre-pay form"
```

---

## Task 5: Photo step (F009)

**Files:**
- Modify: `src/app/_components/order/steps/PhotoStep.tsx`
- Test: `tests/e2e/order-photo.spec.ts`

- [ ] **Step 1: Write the failing E2E** — `tests/e2e/order-photo.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// F009 — optional photo upload; skip NEVER blocks payment; upload yields an access-controlled
// descriptor (no PII in DOM/URL). Transitively exercises F029.
async function fillInfo(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
}

// 1x1 PNG: non-empty + allowlisted type so storeAsset accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pdmAAAAAElFTkSuQmCC",
  "base64",
);

test.describe("order photo — optional, skippable (F009)", () => {
  test("skipping proceeds to the cover step (never blocks)", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-skip").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });

  test("uploading a valid image shows 첨부됨 without leaking the filename", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-input").setInputFiles({
      name: "도윤이-돌사진.png", mimeType: "image/png", buffer: PNG,
    });
    await expect(page.getByTestId("order-photo-status")).toHaveText("사진 첨부됨");
    const html = await page.content();
    expect(html).not.toContain("도윤이-돌사진"); // filename (PII) must not reach the DOM
    expect(page.url()).not.toContain("도윤");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });

  test("an unsupported file shows a friendly error and skip still works", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-input").setInputFiles({
      name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello"),
    });
    await expect(page.getByTestId("order-photo-error")).toBeVisible();
    await page.getByTestId("order-photo-skip").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:e2e -- order-photo.spec.ts`
Expected: FAIL — no `order-photo-input` (PhotoStep is still the stub).

- [ ] **Step 3: Implement the PhotoStep** — replace `src/app/_components/order/steps/PhotoStep.tsx`:

```tsx
"use client";
import { useState, type ChangeEvent } from "react";
import type { Draft } from "../OrderWizard";
import { uploadChildPhoto } from "../photo-action";
import styles from "../order.module.css";

export function PhotoStep({
  draft, onPatch, onNext, onBack,
}: {
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("photo", file);
    const res = await uploadChildPhoto(fd);
    setBusy(false);
    if (res.ok) onPatch({ photo: res.photo });
    else {
      setError(res.error);
      onPatch({ photo: null });
    }
  };

  return (
    <div className={styles.step}>
      <p className={styles.label}>아이 사진 (선택 — 나중에 마이페이지에서 올려도 됩니다)</p>
      <input type="file" accept="image/*" data-testid="order-photo-input" onChange={onFile} disabled={busy} />
      {draft.photo && <p className={styles.photoStatus} data-testid="order-photo-status">사진 첨부됨</p>}
      {error && <p className={styles.error} data-testid="order-photo-error">{error}</p>}
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <div className={styles.navGroup}>
          <button className={styles.back} type="button" data-testid="order-photo-skip"
            onClick={() => { onPatch({ photo: null }); onNext(); }}>건너뛰기</button>
          <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:e2e -- order-photo.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/order/steps/PhotoStep.tsx tests/e2e/order-photo.spec.ts
git commit -m "feat(F009): optional child-photo upload + skip (F029 asset path, PII-safe)"
```

---

## Task 6: Cover + QR step (F010, F019)

**Files:**
- Modify: `src/app/_components/order/steps/CoverStep.tsx`
- Test: `tests/e2e/order-cover.spec.ts`, `tests/e2e/order-qr-addon.spec.ts`

- [ ] **Step 1: Write the failing E2E specs** — `tests/e2e/order-cover.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// F010 — cover selection reflected in the price.
async function toCover(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
}

test.describe("order cover — price reflects the selection (F010)", () => {
  test("soft is 43,000원, hard is 49,000원", async ({ page }) => {
    await toCover(page);
    await page.getByTestId("order-cover-soft").check();
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
    await page.getByTestId("order-cover-hard").check();
    await expect(page.getByTestId("order-line-price")).toHaveText("49,000원");
  });
});
```

`tests/e2e/order-qr-addon.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// F019 — QR add-on toggle: default off; flagged when on; honest "기본 미포함 · 요금 추후 안내"; +0 today.
async function toCover(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
}

test.describe("order QR add-on (F019)", () => {
  test("default off; toggling on flags it + shows the honest note; total unchanged (+0)", async ({ page }) => {
    await toCover(page);
    await expect(page.getByTestId("order-qr-toggle")).not.toBeChecked();
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
    await page.getByTestId("order-qr-toggle").check();
    await expect(page.getByTestId("order-qr-note")).toHaveText("기본 미포함 · 요금 추후 안내");
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:e2e -- order-cover.spec.ts order-qr-addon.spec.ts`
Expected: FAIL — CoverStep is the stub (no cover radios / QR toggle).

- [ ] **Step 3: Implement the CoverStep** — replace `src/app/_components/order/steps/CoverStep.tsx`:

```tsx
"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import { formatWon } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function CoverStep({
  template, draft, unitPriceWon, onPatch, onNext, onBack,
}: {
  template: CatalogTemplate;
  draft: Draft;
  unitPriceWon: number;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className={styles.step}>
      <fieldset className={styles.field}>
        <legend className={styles.label}>커버 선택</legend>
        <div className={styles.choices}>
          <label className={`${styles.choice} ${draft.coverType === "SOFT" ? styles.choiceActive : ""}`}>
            <input type="radio" name="cover" data-testid="order-cover-soft"
              checked={draft.coverType === "SOFT"} onChange={() => onPatch({ coverType: "SOFT" })} />
            소프트커버 <span className={styles.choicePrice}>{formatWon(template.softPriceWon)}</span>
          </label>
          <label className={`${styles.choice} ${draft.coverType === "HARD" ? styles.choiceActive : ""}`}>
            <input type="radio" name="cover" data-testid="order-cover-hard"
              checked={draft.coverType === "HARD"} onChange={() => onPatch({ coverType: "HARD" })} />
            하드커버 <span className={styles.choicePrice}>{formatWon(template.hardPriceWon)}</span>
          </label>
        </div>
      </fieldset>

      <div className={styles.qrRow}>
        <label>
          <input type="checkbox" data-testid="order-qr-toggle"
            checked={draft.qrVideoAddon} onChange={(e) => onPatch({ qrVideoAddon: e.target.checked })} />
          {" "}QR 영상 인사 메시지 옵션
        </label>
      </div>
      {draft.qrVideoAddon && <p className={styles.qrNote} data-testid="order-qr-note">기본 미포함 · 요금 추후 안내</p>}

      <p className={styles.linePrice} data-testid="order-line-price">{formatWon(unitPriceWon)}</p>

      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:e2e -- order-cover.spec.ts order-qr-addon.spec.ts`
Expected: PASS (1 + 1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/order/steps/CoverStep.tsx tests/e2e/order-cover.spec.ts tests/e2e/order-qr-addon.spec.ts
git commit -m "feat(F010,F019): cover selection (price reflects) + QR add-on toggle (flag-only, honest)"
```

---

## Task 7: Review step + add-to-cart + /cart page (F011)

**Files:**
- Modify: `src/app/_components/order/steps/ReviewStep.tsx`
- Create: `src/app/_components/order/CartView.tsx`
- Create: `src/app/cart/page.tsx`
- Test: `tests/e2e/cart.spec.ts`

- [ ] **Step 1: Write the failing E2E** — `tests/e2e/cart.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// F011 — cart shows the configured book (template/cover/personalization) + grand total in 원.
async function configureAndAdd(page: Page, opts: { coverHard?: boolean; qr?: boolean } = {}) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  if (opts.coverHard) await page.getByTestId("order-cover-hard").check();
  if (opts.qr) await page.getByTestId("order-qr-toggle").check();
  await page.getByTestId("order-next").click(); // → review
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

test.describe("cart (F011)", () => {
  test("a soft-cover book shows its line + 43,000원 grand total", async ({ page }) => {
    await configureAndAdd(page);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-line-title")).toHaveText("탄생");
    await expect(page.getByTestId("cart-line-cover")).toHaveText("소프트커버");
    await expect(page.getByTestId("cart-grand-total")).toHaveText("43,000원");
  });

  test("hard cover reflects 49,000원 in the grand total", async ({ page }) => {
    await configureAndAdd(page, { coverHard: true });
    await expect(page.getByTestId("cart-grand-total")).toHaveText("49,000원");
  });

  test("direct navigation to an empty cart shows an honest empty state", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByTestId("cart-empty")).toBeVisible();
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await configureAndAdd(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:e2e -- cart.spec.ts`
Expected: FAIL — ReviewStep stub has no summary; `/cart` route absent.

- [ ] **Step 3: Implement the ReviewStep** — replace `src/app/_components/order/steps/ReviewStep.tsx`:

```tsx
"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import { formatWon } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

const COVER_LABEL = { SOFT: "소프트커버", HARD: "하드커버" } as const;

export function ReviewStep({
  template, draft, unitPriceWon, onBack, onAddToCart,
}: {
  template: CatalogTemplate;
  draft: Draft;
  unitPriceWon: number;
  onBack: () => void;
  onAddToCart: () => void;
}) {
  return (
    <div className={styles.step}>
      <div className={styles.summary} data-testid="order-review-summary">
        <span className={styles.summaryTitle}>{template.label}</span>
        <span className={styles.summaryRow}><span>아이</span><span>{draft.childName} · {draft.childGender === "MALE" ? "남아" : "여아"}</span></span>
        <span className={styles.summaryRow}><span>커버</span><span>{COVER_LABEL[draft.coverType]}</span></span>
        <span className={styles.summaryRow}><span>사진</span><span>{draft.photo ? "첨부됨" : "나중에 올리기"}</span></span>
        <span className={styles.summaryRow}><span>QR 영상</span><span>{draft.qrVideoAddon ? "옵션 추가 (요금 추후 안내)" : "미포함"}</span></span>
        <span className={styles.summaryRow}><span>금액</span><span>{formatWon(unitPriceWon)}</span></span>
      </div>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-add-to-cart" onClick={onAddToCart}>장바구니에 담기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the CartView** — `src/app/_components/order/CartView.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "../Nav";
import { Footer } from "../Footer";
import { formatWon } from "../catalog/templates";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import styles from "./order.module.css";

const COVER_LABEL = { SOFT: "소프트커버", HARD: "하드커버" } as const;

export function CartView() {
  // SSR renders a deterministic empty shell; the real cart is read from localStorage on mount
  // (cart lives client-side so it survives the Toss redirect — enables F016).
  const [cart, setCart] = useState<Cart>({ lines: [], qrVideoAddon: false });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCart(loadCart());
    setReady(true);
  }, []);
  const isEmpty = cart.lines.length === 0;

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="cart-title">
          <p className="eyebrow">Cart</p>
          <h1 className="hero__title" id="cart-title">장바구니</h1>
        </section>
        <section className={styles.cart} aria-label="장바구니" data-testid="cart">
          {ready &&
            (isEmpty ? (
              <div className={styles.empty} data-testid="cart-empty">
                <p>장바구니가 비어 있습니다.</p>
                <Link className="cta" href="/anniversary">그림책 둘러보기</Link>
              </div>
            ) : (
              <>
                {cart.lines.map((line) => (
                  <div key={line.id} className={styles.cartLine} data-testid="cart-line">
                    <span className={styles.cartLineTitle} data-testid="cart-line-title">{line.templateLabel}</span>
                    <span className={styles.cartLineMeta} data-testid="cart-line-cover">{COVER_LABEL[line.coverType]}</span>
                    <span className={styles.cartLineMeta} data-testid="cart-line-person">
                      {line.personalization.childName} · {line.personalization.childGender === "MALE" ? "남아" : "여아"}
                    </span>
                    <span className={styles.cartLineMeta}>{formatWon(line.unitPriceWon)}</span>
                  </div>
                ))}
                {cart.qrVideoAddon && (
                  <p className={styles.qrTag} data-testid="cart-qr">QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
                )}
                <div className={styles.cartTotals}>
                  <span>총 결제 금액</span>
                  <span className={styles.grandTotal} data-testid="cart-grand-total">{formatWon(grandTotalWon(cart))}</span>
                </div>
                <button className="cta" type="button" data-testid="cart-checkout" disabled>결제하기 (준비중)</button>
              </>
            ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 5: Create the /cart route** — `src/app/cart/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CartView } from "../_components/order/CartView";

export const metadata: Metadata = { title: "장바구니 · 그림책 제작소" };
export const dynamic = "force-dynamic";

export default function CartPage() {
  return <CartView />;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test:e2e -- cart.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/_components/order/steps/ReviewStep.tsx src/app/_components/order/CartView.tsx src/app/cart tests/e2e/cart.spec.ts
git commit -m "feat(F011): review step + add-to-cart + /cart (lines, grand total, empty state)"
```

---

## Task 8: Full-gate verification across the funnel

**Files:** none (verification only)

- [ ] **Step 1: Run the full machine gate**

Run: `pnpm check`
Expected: PASS — lint + typecheck + all unit tests + constraints R1–R8 = 0 violations. If R6/R7 fire, fix the offending CSS (use tokens, no `box-shadow`, no `#fff`/`#000`).

- [ ] **Step 2: Run the entire E2E suite (no regressions)**

Run: `pnpm test:e2e`
Expected: PASS — the prior 17 (home/content/category) + the new 6 order/cart specs all green.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `pnpm dev` then open `http://localhost:3000/anniversary` → click a card → complete the funnel → land on `/cart`. Confirm the price reflects the cover and the cart shows the line.

- [ ] **Step 4: Commit (only if Step 1/2 required fixes)**

```bash
git add -A
git commit -m "chore(order): green pnpm check + full E2E across the funnel"
```

---

## Task 9: State, decisions, and worker≠checker review

**Files:**
- Modify: `feature_list.json`, `PROGRESS.md`, `DECISIONS.md`

- [ ] **Step 1: Record attempts** (per CLAUDE.md session routine), then run the independent review

Run: `pnpm attempt F007` (repeat per id as worked). Then conduct the **worker≠checker** adversarial review (F042/ADR-0005) on the diff — an independent pass judging Accept/Revise/Block, recorded in PROGRESS.md. Fix anything it confirms before marking `passes:true`.

- [ ] **Step 2: Flip F007–F011, F019 to `passing` with evidence** in `feature_list.json`

For each of F007, F008, F009, F010, F011, F019: set `"state": "passing"`, `"passes": true`, and a dated `"evidence"` string naming the spec that passed + `pnpm check` green. For **F009**, the evidence MUST state precisely what is persisted vs deferred, e.g.:

```
"2026-06-02 Playwright order-photo.spec.ts: skip never blocks; upload stores an access-controlled descriptor via the F029 asset path (receiveUpload→storeAsset CHILD_PHOTO), filename/child-name never in DOM/URL. Durable object-storage of bytes + the Asset DB row are deferred to mypage (F017)/checkout — pre-pay produces only the safe descriptor (ADR-0011). pnpm check green."
```

- [ ] **Step 3: Advance F035 (do NOT flip)** — update only F035's `evidence` to enumerate the new 375px coverage; leave `state:"in_progress"`, `passes:false`:

```
"Home + category + order funnel (order-start + cart 375px no-overflow green). Checkout 375px still pending TRACK-CHECKOUT before F035 can pass."
```

- [ ] **Step 4: Add ADR-0011 to `DECISIONS.md`** (append):

```markdown
## 2026-06-02 — ADR-0011 — TRACK-ORDER: client wizard + pure cart, with ratified scope deviations
- Decision: the entry-line funnel is a client-side stepped wizard at /order/[templateKey] backed by
  a pure src/lib/cart.ts model persisted to localStorage; DB-free until checkout. extraVar is resolved
  via the extended catalog loader (threaded through the DB seam AND the seed mirror + getTemplateByKey).
  QR is a flag-only toggle priced via a single QR_ADDON_WON=0 constant (brief lists it paid but states
  no price; schema has no QR price field) — presented honestly as "기본 미포함 · 요금 추후 안내".
- Scope deviations from the literal track file-list (ratified, conflict-free — no concurrent writer):
  (a) extended src/app/_components/catalog/templates.ts (merged TRACK-CAT file); (b) created src/app/cart/
  (checkout features F012/F016 reference /cart explicitly); (c) added tests/unit/{cart,order-personalization}.test.ts
  + extended tests/unit/catalog.test.ts.
- Child PII in localStorage: childName/childGender/extraVar live device-locally — within the brief's PII
  rules (forbidden surfaces are logs/traces/E2E fixtures, not the buyer's own device); the photo descriptor
  is non-PII (opaque key). Cart cleared after F013 PAID via clearCart() (never on checkout start → preserves F016).
- Handoff to TRACK-CHECKOUT: buyer identity (Order.buyerName/buyerEmail) is checkout's step, not the cart;
  the order amount MUST be recomputed server-side from authoritative Template prices (client grandTotalWon
  is display-only/untrusted); templateKey→Template.id resolution + DB seeding are checkout's job.
- Why: matches the hermetic no-DB E2E pattern + the "checkout imports cart.ts" contract; hardened by a
  32-agent adversarial design review (0 blockers; 6 majors folded in).
- Rejected: server-persisted draft orders (breaks the hermetic gate); a second order-local extraVar mirror
  (drift risk — extended the one catalog SoR instead, guarded by a seed-parity unit test).
```

- [ ] **Step 5: Update `PROGRESS.md`** — add a session-log entry (newest first) summarizing the funnel build, the review outcome, and the F035 advance; refresh the Handoff "Next action" to point at TRACK-CHECKOUT (F012–F016) and note the cart.ts contract + the handoff notes above.

- [ ] **Step 6: Final gate + commit**

```bash
pnpm check
git add feature_list.json PROGRESS.md DECISIONS.md .harness/attempts.json
git commit -m "chore(F007-F011,F019): mark passing + evidence; F035 advanced; ADR-0011; progress"
```

- [ ] **Step 7: Finish the branch** — use the `superpowers:finishing-a-development-branch` skill to merge `feat/order` → `master` (`--no-ff`), re-verifying `pnpm check` + `pnpm test:e2e` green on `master`.

---

## Self-Review (completed by author)

- **Spec coverage:** F007 (Task 1 extraVar + Task 4 route/start), F008 (Task 3 validator + Task 4 form), F009 (Task 5 photo + F029 path), F010 (Task 6 cover price), F019 (Task 6 QR), F011 (Task 7 cart). All 6 review-confirmed majors covered: extraVar DB-seam (Task 1), getTemplateByKey hermetic fallback (Task 1), photo server-action robustness (Task 4 action + Task 5 negative test), cart-clear-after-PAID (`clearCart`, Task 2 + ADR-0011), honest photo deferral (Task 9 evidence). Minors: server-side amount recompute / buyer identity / templateKey→id (ADR-0011 handoff), /cart client component + empty state (Task 7), multi-line model unit-tested (Task 2), QR named constant + honest line (Tasks 2/6), distinct sibling labels (Task 3/4), F035 advance-not-flip (Task 9).
- **Placeholder scan:** the only `TODO` is the intentional `QR_ADDON_WON` pricing deferral (documented in ADR-0011). Step stubs in Task 4 are explicitly replaced in Tasks 5–7.
- **Type consistency:** `Draft`, `CartLine`, `CoverType`, `Gender`, `ExtraVarValue`, `TemplateExtraVar`, `getTemplateByKey`, `validatePersonalization`/`isValid`/`toExtraVarValue`, `uploadChildPhoto`/`PhotoResult` are defined once and used with matching signatures across tasks. testids are listed once in the File Structure header and reused verbatim by every spec.
