-- F060: 관리자 배송 처리 — SHIPPED 전이 시 운송장(택배사·번호) 기록.
-- (기존 테이블 ALTER — R10은 CREATE TABLE에만 적용.)
ALTER TABLE "Order" ADD COLUMN "trackingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
