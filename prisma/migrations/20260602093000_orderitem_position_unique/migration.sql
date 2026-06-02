-- Enforce the item-ordering invariant: at most one OrderItem per position within an order.
-- (OrderItem.position is the 0-based index used for stable mypage-finishing addressing.)
CREATE UNIQUE INDEX "OrderItem_orderId_position_key" ON "OrderItem"("orderId", "position");
