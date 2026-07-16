import { describe, it, expect } from "vitest";
import { trackingUrl, resolveCarrier, carrierDisplayName } from "../../src/app/api/payments/_lib/tracking";

// F068 — pure carrier→조회 URL 딥링크 레지스트리. 관리자 자유입력 택배사 이름을 정규화해
// 등록된 택배사의 조회 페이지 URL로 매핑; 미등록/빈 값은 null(정직한 텍스트 폴백).

describe("F068 tracking deep-link registry", () => {
  it("CJ대한통운 → cjlogistics 조회 URL, 운송장은 숫자만(하이픈 제거)", () => {
    const url = trackingUrl("CJ대한통운", "1234-5678-9012");
    expect(url).not.toBeNull();
    expect(url).toContain("cjlogistics.com");
    expect(url).toContain("123456789012");
    expect(url).not.toContain("-");
  });

  it("항상 절대 https:// URL을 돌려준다(상대경로 회귀 방지 — 새 탭에서 origin 상대 해석 금지)", () => {
    for (const carrier of ["CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배"]) {
      expect(trackingUrl(carrier, "6012345678901")).toMatch(/^https:\/\//);
    }
  });

  it("우체국·한진·롯데·로젠 각각 해당 도메인으로 매핑된다", () => {
    expect(trackingUrl("우체국택배", "1111111111")).toContain("epost.go.kr");
    expect(trackingUrl("한진택배", "1111111111")).toContain("hanjin.com");
    expect(trackingUrl("롯데택배", "1111111111")).toContain("lotteglogis.com");
    expect(trackingUrl("로젠택배", "1111111111")).toContain("ilogen.com");
  });

  it("별칭·부분 이름·대소문자·공백을 관대하게 인식한다", () => {
    expect(trackingUrl("CJ", "1")).toContain("cjlogistics");
    expect(trackingUrl(" 대한통운 ", "1")).toContain("cjlogistics");
    expect(trackingUrl("우체국 등기", "1")).toContain("epost");
    expect(trackingUrl("hanjin", "1")).toContain("hanjin");
  });

  it("등록되지 않은 택배사는 null(정직한 텍스트 폴백)", () => {
    expect(trackingUrl("동네퀵서비스", "999888777")).toBeNull();
    expect(resolveCarrier("듣도보도못한택배")).toBeNull();
  });

  it("빈 택배사·숫자 없는 운송장은 null", () => {
    expect(trackingUrl("", "123")).toBeNull();
    expect(trackingUrl("CJ대한통운", "")).toBeNull();
    expect(trackingUrl("CJ대한통운", "----")).toBeNull();
  });

  it("resolveCarrier는 정규 표시명을 돌려준다(등록 택배사)", () => {
    expect(resolveCarrier("cj대한통운")?.name).toBe("CJ대한통운");
    expect(resolveCarrier("로젠")?.name).toBe("로젠택배");
  });

  it("carrierDisplayName: 인식된 별칭은 정규 표시명으로, 미등록은 입력 원문 그대로", () => {
    // 관리자 자유입력의 지저분한 별칭이 구매자 화면·이메일에 노출되지 않도록 정규화(F068 리뷰)
    expect(carrierDisplayName("cj")).toBe("CJ대한통운");
    expect(carrierDisplayName(" 대한통운 ")).toBe("CJ대한통운");
    expect(carrierDisplayName("우체국 등기")).toBe("우체국택배");
    expect(carrierDisplayName("동네퀵서비스")).toBe("동네퀵서비스"); // 미등록 → 원문 유지
  });
});
