-- F092: 전환 지표(퍼스트파티) 이벤트(AnalyticsEvent). 구매 퍼널의 page_view/scroll/cta_click을
-- 닫힌 어휘로 append 적재(서버 validateEvent가 어휘 강제 — 쿼리스트링 폐기·미추적 경로 드롭).
-- PII 필드는 구조적으로 없다(E3): 익명 sessionId·정규화 경로·닫힌 이름/임계값뿐.
-- RLS는 R10: 새 public 테이블은 생성 마이그레이션에서 즉시 ENABLE (deny-all — 앱은 Prisma
-- direct-protocol owner 역할로 우회; 20260617000000_enable_rls 참조).

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "path" TEXT NOT NULL,
    "value" INTEGER,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");
CREATE INDEX "AnalyticsEvent_kind_name_idx" ON "AnalyticsEvent"("kind", "name");
CREATE INDEX "AnalyticsEvent_kind_path_idx" ON "AnalyticsEvent"("kind", "path");
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- R10: RLS on, no policies (deny-all for anon/authenticated; Prisma owner bypasses).
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
