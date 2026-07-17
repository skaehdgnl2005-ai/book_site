-- F071: 구매 인증 후기(Review). 주문 소유 게이트를 통과한 구매자만 작성, 주문당 1개(@unique).
-- RLS는 R10: 새 public 테이블은 생성 마이그레이션에서 즉시 ENABLE (deny-all — 앱은 Prisma
-- direct-protocol owner 역할로 우회; 20260617000000_enable_rls 참조).

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R10: RLS on, no policies (deny-all for anon/authenticated; Prisma owner bypasses).
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
