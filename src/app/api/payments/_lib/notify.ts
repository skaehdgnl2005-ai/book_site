/**
 * F055 — the route/page-layer settlement notifier: schedules the order-confirmation email
 * with after() (never blocks or fails the payment response — the OTP-send precedent,
 * actions.ts). Exactly-once is guaranteed UPSTREAM by markPaid's atomic conditional write
 * (confirm/webhook race → only the transitioning call notifies); this module only composes
 * and schedules. The message carries PII-minimal commerce facts (see EmailMessage — child
 * name/dedication/address are excluded by construction). Prod without a provisioned provider
 * fail-closes inside emailAdapter (payment unaffected; error is redact()-logged).
 */
import { after } from "next/server";
import { emailAdapter } from "../../../../lib/email";
import { redact } from "../../../../lib/env";
import type { StoredOrder } from "./orders";
import type { SettlementNotifier } from "./checkout";

export function orderConfirmationNotifier(): SettlementNotifier {
  return (order: StoredOrder) => {
    // Snapshot the fields before the async hop (never hold the whole order in the closure).
    const to = order.buyerEmail;
    const orderId = order.id;
    const orderName = order.orderName;
    const amountWon = order.amountWon;
    after(async () => {
      try {
        await emailAdapter().send({ kind: "order_confirmation", to, orderId, orderName, amountWon });
      } catch (e) {
        console.warn("order confirmation send failed:", redact(String(e))); // settled payment stands
      }
    });
  };
}
