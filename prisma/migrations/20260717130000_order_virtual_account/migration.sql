-- F070: 가상계좌(무통장입금) — WAITING_FOR_DEPOSIT 주문 상태 + 발급된 가상계좌 정보.
-- 기존 enum/테이블 ALTER (R10은 CREATE TABLE에만 적용). 새 enum 값을 이 트랜잭션에서 '사용'하지
-- 않고 추가만 하므로 PG 12+(프로덕션 PG16)에서 트랜잭션 내 ADD VALUE 허용.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_DEPOSIT';
ALTER TABLE "Order" ADD COLUMN "depositBank" TEXT;
ALTER TABLE "Order" ADD COLUMN "depositAccount" TEXT;
ALTER TABLE "Order" ADD COLUMN "depositDueDate" TIMESTAMP(3);
