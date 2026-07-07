-- F056 (ADR-0023): 회원 기반 — passwordless User + 로그인 OTP(LoginOtp, 주문-스코프 OtpCode와
-- 동일 원자 계약의 유저-스코프 사본). RLS는 R10: 새 public 테이블은 생성 마이그레이션에서 즉시
-- ENABLE (deny-all — 앱은 Prisma direct-protocol owner 역할로 우회; 20260617000000_enable_rls 참조).

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "displayName" TEXT,
    "kakaoId" TEXT,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");

CREATE TABLE "LoginOtp" (
    "subject" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginOtp_pkey" PRIMARY KEY ("subject")
);

-- R10: RLS on, no policies (deny-all for anon/authenticated; Prisma owner bypasses).
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoginOtp" ENABLE ROW LEVEL SECURITY;
