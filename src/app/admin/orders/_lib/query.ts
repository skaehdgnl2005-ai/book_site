/**
 * F088 — /admin/orders URL 파라미터 순수 헬퍼. 페이지 링크·프리셋 링크·GET 폼이 서로의
 * 파라미터를 보존하는 단일 직렬화 지점 (값 없는 키는 내보내지 않는다).
 */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}
