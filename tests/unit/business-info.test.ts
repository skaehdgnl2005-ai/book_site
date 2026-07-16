import { describe, it, expect } from "vitest";
import { businessInfo, ftcLookupUrl } from "../../src/lib/businessInfo";

// F064 — 푸터 법정 표시사항(전자상거래법 제10조)의 값 계약.
// 실값은 BIZ_* env로 주입되며, 미설정이면 null을 돌려 UI가 정직한
// '준비 중' 플레이스홀더를 렌더한다(가짜 값 발명 금지 — F028 패턴).

describe("businessInfo", () => {
  it("미설정/공백 필드는 null (trim 후 빈 문자열도 null)", () => {
    const biz = businessInfo({});
    expect(biz.ownerName).toBeNull();
    expect(biz.address).toBeNull();
    expect(biz.phone).toBeNull();
    expect(biz.email).toBeNull();
    expect(biz.regNo).toBeNull();
    expect(biz.mailOrderNo).toBeNull();
    expect(biz.privacyOfficer).toBeNull();
    expect(businessInfo({ BIZ_OWNER: "   " }).ownerName).toBeNull();
  });

  it("상호는 기본값 '그림책 제작소', BIZ_NAME으로 덮어쓸 수 있다", () => {
    expect(businessInfo({}).name).toBe("그림책 제작소");
    expect(businessInfo({ BIZ_NAME: "주식회사 여백북스" }).name).toBe("주식회사 여백북스");
  });

  it("설정된 값은 trim되어 그대로 노출된다", () => {
    const biz = businessInfo({
      BIZ_OWNER: " 김대표 ",
      BIZ_ADDRESS: "서울특별시 어딘가구 어딘가로 1",
      BIZ_PHONE: "02-000-0000",
      BIZ_EMAIL: "help@shop.kr",
      BIZ_REG_NO: "123-45-67890",
      BIZ_MAILORDER_NO: "제2026-서울강남-0000호",
      BIZ_PRIVACY_OFFICER: "김대표",
    });
    expect(biz.ownerName).toBe("김대표");
    expect(biz.address).toBe("서울특별시 어딘가구 어딘가로 1");
    expect(biz.phone).toBe("02-000-0000");
    expect(biz.email).toBe("help@shop.kr");
    expect(biz.regNo).toBe("123-45-67890");
    expect(biz.mailOrderNo).toBe("제2026-서울강남-0000호");
    expect(biz.privacyOfficer).toBe("김대표");
  });

  it("호스팅서비스 제공자는 정적 Vercel (배포 대상 고정)", () => {
    expect(businessInfo({}).hostingProvider).toBe("Vercel Inc.");
  });
});

describe("ftcLookupUrl (공정위 사업자정보확인)", () => {
  it("등록번호의 숫자 10자리로 공정위 조회 URL을 만든다", () => {
    expect(ftcLookupUrl("123-45-67890")).toBe(
      "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890",
    );
    expect(ftcLookupUrl("1234567890")).toBe(
      "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890",
    );
  });

  it("등록번호가 없거나 10자리 숫자가 아니면 링크를 만들지 않는다(깨진 링크 방지)", () => {
    expect(ftcLookupUrl(null)).toBeNull();
    expect(ftcLookupUrl("")).toBeNull();
    expect(ftcLookupUrl("12-34")).toBeNull();
    expect(ftcLookupUrl("123-45-678901")).toBeNull();
  });
});
