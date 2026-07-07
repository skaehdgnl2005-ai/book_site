-- F062: 구매자 취소 요청 접수(사유 포함). 환불 집행은 F063(requireApproval 게이트).
-- (기존 테이블 ALTER — R10은 CREATE TABLE에만 적용.)
ALTER TABLE "Order" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancelReason" TEXT;
