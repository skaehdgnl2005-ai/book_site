-- F073: 관리자 감사 로그(AdminAuditLog). 관리자 변이마다 행위자·액션·대상·전후 상태를 append 기록.
-- ADR-0024 D2 준수: PII(구매자 이름/이메일/주소) 미기록 — actorUserId/targetId는 내부 식별자, before/after는 상태 문자열.
-- RLS는 R10: 새 public 테이블은 생성 마이그레이션에서 즉시 ENABLE (deny-all — 앱은 Prisma direct-protocol
-- owner 역할로 우회; 20260617000000_enable_rls 참조). 이 마이그레이션은 F070/F071 미배포 큐 뒤 순서.

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- R10: RLS on, no policies (deny-all for anon/authenticated; Prisma owner bypasses).
ALTER TABLE "AdminAuditLog" ENABLE ROW LEVEL SECURITY;
