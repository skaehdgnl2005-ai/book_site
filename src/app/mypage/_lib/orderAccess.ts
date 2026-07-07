/**
 * F057 — ONE order-access predicate for every mypage gate: the per-order capability cookie
 * (guest OTP path, F046 — checked FIRST, no order lookup, preserving the no-existence-oracle
 * discipline) OR the account session owning the order (member path — order.userId must equal
 * the live session user). Non-owners get the same negative regardless of whether the order
 * exists. The guest path is byte-for-byte the pre-F057 behavior.
 */
import { cookies } from "next/headers";
import { cookieName, verifyAccess } from "./access";
import { getSessionUser } from "../../account/_lib/sessionUser";
import { orderRepo } from "../../api/payments/_lib/orders";

export async function hasOrderAccess(orderId: string): Promise<boolean> {
  const token = (await cookies()).get(cookieName(orderId))?.value ?? null;
  if (verifyAccess(orderId, token)) return true;
  const user = await getSessionUser();
  if (!user) return false;
  const order = await orderRepo().get(orderId);
  return order?.userId != null && order.userId === user.id;
}
