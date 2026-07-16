/**
 * 법정 사업자 표시 정보 (F064 — 전자상거래법 제10조).
 *
 * 값은 전부 BIZ_* env로 주입한다: 사업자등록·통신판매업 신고가 끝나는 날
 * env만 채우면 사이트가 즉시 준수 상태가 되도록 코드와 실값을 분리.
 * 미설정이면 null — UI는 정직한 '준비 중' 플레이스홀더를 렌더한다
 * (F028 contact 페이지와 같은 규약; 가짜 값 발명 금지).
 * 표시 전용 공개 정보라 env.ts 부트 계약(시크릿 검증)과는 분리해 두고,
 * adminAuth.ts처럼 주입 가능한 raw env 시그니처를 따른다.
 */

export type BusinessInfo = {
  /** 상호 (기본: 브랜드명) */
  name: string;
  /** 대표자 성명 */
  ownerName: string | null;
  /** 사업장 주소 (소비자 불만 처리 가능 주소) */
  address: string | null;
  /** 대표 전화번호 */
  phone: string | null;
  /** 대표 이메일 */
  email: string | null;
  /** 사업자등록번호 */
  regNo: string | null;
  /** 통신판매업 신고번호 (신고기관 포함 표기 권장) */
  mailOrderNo: string | null;
  /** 개인정보관리(보호)책임자 성명 */
  privacyOfficer: string | null;
  /** 호스팅서비스 제공자 — 배포 대상이 Vercel로 고정이라 정적 */
  hostingProvider: string;
};

function opt(raw: Record<string, string | undefined>, key: string): string | null {
  const v = raw[key]?.trim();
  return v ? v : null;
}

export function businessInfo(
  raw: Record<string, string | undefined> = process.env,
): BusinessInfo {
  return {
    name: opt(raw, "BIZ_NAME") ?? "그림책 제작소",
    ownerName: opt(raw, "BIZ_OWNER"),
    address: opt(raw, "BIZ_ADDRESS"),
    phone: opt(raw, "BIZ_PHONE"),
    email: opt(raw, "BIZ_EMAIL"),
    regNo: opt(raw, "BIZ_REG_NO"),
    mailOrderNo: opt(raw, "BIZ_MAILORDER_NO"),
    privacyOfficer: opt(raw, "BIZ_PRIVACY_OFFICER"),
    hostingProvider: "Vercel Inc.",
  };
}

/**
 * 공정위 '사업자정보확인' 조회 링크. 등록번호의 숫자가 정확히 10자리일 때만
 * 만든다 — 형식이 어긋나면 링크를 아예 내지 않는 쪽이 깨진 팝업보다 정직하다.
 */
export function ftcLookupUrl(regNo: string | null): string | null {
  if (!regNo) return null;
  const digits = regNo.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${digits}`;
}
