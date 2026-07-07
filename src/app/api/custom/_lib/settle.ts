/**
 * F052 — settle a 맞춤 직접작성(WRITTEN) payment.
 *
 * Before F052 the confirm step only flipped the CustomRequest to SUBMITTED: no Order row, no
 * paymentKey anywhere → a paid 119,000원 request could not be refunded or reconciled. Settling
 * now persists the payment as an `Order(kind=CUSTOM)` whose `id === tossOrderId ===
 * CustomRequest.id`, links `CustomRequest.orderId`, and only then marks the request SUBMITTED.
 *
 * Injectable (store/repo/provider passed by the caller — the `confirmPayment(repo, provider, …)`
 * precedent) so the whole flow is hermetically unit-tested; routes/pages wire the globalThis
 * singletons. Confirm always uses the SERVER-held amount (never the redirect query's). Idempotent
 * end to end: an already-settled request short-circuits, an already-PAID order (webhook-first)
 * skips the gateway (a real Toss re-confirm would 402), `markPaid`/`linkOrder` keep first values.
 */
import {
  CUSTOM_ORDER_NAME,
  type CustomBackend,
  type StoredCustomRequest,
} from "../../../../lib/customRequest";
import type { PaymentProvider } from "../../../../lib/payments";
import type { OrderRepo } from "../../payments/_lib/orders";

export type CustomStore = Pick<CustomBackend, "get" | "markSubmitted" | "linkOrder">;

type SettleResult = { status: number; body: { status?: string; id?: string; errors?: string[] } };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Ensure the CREATED Order(kind=CUSTOM) exists — legacy pre-F052 requests have none. */
async function ensureOrder(repo: OrderRepo, rec: StoredCustomRequest) {
  const existing = await repo.get(rec.id);
  if (existing) return existing;
  return repo.create({
    kind: "CUSTOM",
    id: rec.id,
    amountWon: rec.amountWon,
    orderName: CUSTOM_ORDER_NAME,
    qrVideoAddon: false,
    buyerName: rec.contactName,
    buyerEmail: rec.contactEmail,
    items: [],
  });
}

export async function settleWrittenPayment(
  store: CustomStore,
  repo: OrderRepo,
  provider: PaymentProvider,
  input: { id: unknown; paymentKey: unknown },
): Promise<SettleResult> {
  const id = asString(input.id);
  const paymentKey = asString(input.paymentKey);

  const rec = await store.get(id);
  if (!rec) return { status: 404, body: { errors: ["접수 내역을 찾을 수 없습니다."] } };
  if (rec.path !== "WRITTEN") return { status: 400, body: { errors: ["결제 대상이 아닌 접수입니다."] } };
  // Idempotent replay (page reload after settle): already submitted — report the real state.
  if (rec.status !== "PENDING_PAYMENT") return { status: 200, body: { status: rec.status, id: rec.id } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };

  const order = await ensureOrder(repo, rec);
  if (order.status !== "PAID") {
    // SERVER-held amount — the ?amount= query param is display-only and never trusted.
    const conf = await provider.confirm({ paymentKey, orderId: rec.id, amount: rec.amountWon });
    if (conf.status !== "PAID") return { status: 402, body: { status: conf.status } };
    await repo.markPaid(rec.id, conf.paymentKey);
  }
  await store.linkOrder(rec.id, rec.id); // Order.id === CustomRequest.id (F052 invariant)
  const updated = await store.markSubmitted(rec.id);
  return { status: 200, body: { status: updated?.status ?? "SUBMITTED", id: rec.id } };
}

/**
 * Buyer paid but never came back (closed the window after Toss): the async webhook has already
 * marked the Order PAID, while the request is still PENDING_PAYMENT. Converge when any later
 * visit reads the request. No gateway call — the Order's PAID state is the settled truth.
 */
export async function reconcileWrittenFromOrder(
  store: CustomStore,
  repo: OrderRepo,
  id: string,
): Promise<StoredCustomRequest | undefined> {
  const rec = await store.get(id);
  if (!rec || rec.path !== "WRITTEN" || rec.status !== "PENDING_PAYMENT") return rec;
  const order = await repo.get(id);
  if (order?.status !== "PAID") return rec;
  await store.linkOrder(id, order.id);
  return (await store.markSubmitted(id)) ?? rec;
}
