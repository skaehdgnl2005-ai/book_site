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
