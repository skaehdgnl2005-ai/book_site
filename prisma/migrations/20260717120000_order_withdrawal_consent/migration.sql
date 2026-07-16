-- F067: 결제 전 청약철회 제한 고지 동의 시각(전자상거래법 17조 2항 6호 증거).
-- (기존 테이블 ALTER — R10은 CREATE TABLE에만 적용.)
ALTER TABLE "Order" ADD COLUMN "withdrawalConsentAt" TIMESTAMP(3);
