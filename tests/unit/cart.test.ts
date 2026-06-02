import { describe, it, expect, afterEach } from "vitest";
import {
  emptyCart, lineTotalWon, grandTotalWon, addLine, removeLine, setQrAddon,
  orderName, toCheckoutSummary, QR_ADDON_WON, loadCart, saveCart, type CartLine,
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

// ── localStorage stub ────────────────────────────────────────────────────────

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

const STORAGE_KEY = "gpms.cart.v1";

describe("cart persistence (localStorage)", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("round-trips a cart with lines and qrVideoAddon through save/load", () => {
    stubLocalStorage();
    const original = setQrAddon(addLine(emptyCart(), line("r1", "돌", 43000)), true);
    saveCart(original);
    const restored = loadCart();
    expect(restored.lines).toHaveLength(1);
    expect(restored.lines[0].id).toBe("r1");
    expect(restored.qrVideoAddon).toBe(true);
  });

  it("returns emptyCart() when stored value is malformed JSON", () => {
    stubLocalStorage({ [STORAGE_KEY]: "{ not json" });
    expect(loadCart()).toEqual(emptyCart());
  });

  it("returns emptyCart() when lines is not an array", () => {
    stubLocalStorage({ [STORAGE_KEY]: '{"lines":"x"}' });
    expect(loadCart()).toEqual(emptyCart());
  });

  it("drops malformed lines but keeps valid ones", () => {
    const validLine = line("v1", "생일", 49000);
    const seeded = JSON.stringify({
      lines: [validLine, null, { unitPriceWon: "oops" }],
      qrVideoAddon: false,
    });
    stubLocalStorage({ [STORAGE_KEY]: seeded });
    const result = loadCart();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].id).toBe("v1");
  });
});
