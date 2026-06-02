import { describe, it, expect } from "vitest";
import {
  emptyCart, lineTotalWon, grandTotalWon, addLine, removeLine, setQrAddon,
  orderName, toCheckoutSummary, QR_ADDON_WON, type CartLine,
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
