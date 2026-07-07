-- F057: 주문-회원 연결 — 로그인 결제는 즉시, 게스트 주문은 이메일 소유 증명 시 소급 claim.
-- (기존 테이블 ALTER — R10은 CREATE TABLE에만 적용.)
ALTER TABLE "Order" ADD COLUMN "userId" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_userId_idx" ON "Order"("userId");
