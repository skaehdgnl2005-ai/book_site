"use client";
/**
 * F092 — 전환 지표 트래커(전역 클라이언트 리프, 루트 레이아웃에서 마운트).
 * page_view(라우트 변경)·scroll(25/50/75/100 임계, 경로당 1회)·cta_click(data-analytics 위임)을
 * navigator.sendBeacon으로 POST /api/events에 보낸다(내비게이션·이탈에도 유실 최소화).
 *
 * 원칙: 어떤 실패도 페이지에 전파하지 않는다(전 경로 try/catch) — 지표는 best-effort.
 * 식별자는 익명 sessionStorage 세션 ID뿐(쿠키·PII 0). /admin·/api는 클라이언트에서도 안 보낸다
 * (서버 정규화도 드롭하지만 불필요 트래픽을 만들지 않는다).
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { crossedThresholds } from "../api/events/_lib/eventVocab";

const SID_KEY = "gb_sid";
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sessionId(): string | null {
  try {
    let v = window.sessionStorage.getItem(SID_KEY);
    if (!v || !SID_RE.test(v)) {
      v =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      window.sessionStorage.setItem(SID_KEY, v);
    }
    return v;
  } catch {
    return null; // sessionStorage 불가(프라이빗 모드 등) → 추적하지 않는다
  }
}

function send(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }))
    ) {
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 지표 전송 실패는 무시
  }
}

function isTracked(pathname: string | null): pathname is string {
  return !!pathname && !pathname.startsWith("/admin") && !pathname.startsWith("/api");
}

export function AnalyticsTracker(): null {
  const pathname = usePathname();
  const sentDepths = useRef<Set<number>>(new Set());

  // page_view — 경로 변경마다 1회. 스크롤 임계 전송 이력도 경로 단위로 초기화.
  useEffect(() => {
    if (!isTracked(pathname)) return;
    sentDepths.current = new Set();
    const sid = sessionId();
    if (!sid) return;
    send({ kind: "page_view", path: pathname, sessionId: sid });
  }, [pathname]);

  // scroll — 도달 비율이 임계를 넘을 때마다 미전송분만 전송. 뷰포트보다 짧은 페이지는
  // 로드 즉시 100%(실제로 전부 보였으므로 정직한 값).
  useEffect(() => {
    if (!isTracked(pathname)) return;
    const onScroll = () => {
      try {
        const total = document.documentElement.scrollHeight;
        if (!(total > 0)) return;
        const ratio = (window.scrollY + window.innerHeight) / total;
        const crossed = crossedThresholds(ratio, sentDepths.current);
        if (crossed.length === 0) return;
        const sid = sessionId();
        if (!sid) return;
        for (const depth of crossed) {
          sentDepths.current.add(depth);
          send({ kind: "scroll", path: pathname, value: depth, sessionId: sid });
        }
      } catch {
        // 무시
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // cta_click — data-analytics 위임(capture: 내비게이션 전에 비컨을 띄운다).
  // closest는 "가장 가까운 인터랙티브 조상"을 먼저 잡는다 — data-analytics 없는 중첩
  // 버튼(예: 템플릿 카드 안 미리 읽기)은 카드 클릭으로 오인 집계하지 않는다.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      try {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest("button, a, [data-analytics]");
        if (!el) return;
        const name = el.getAttribute("data-analytics");
        if (!name) return;
        const sid = sessionId();
        if (!sid) return;
        send({ kind: "cta_click", name, path: window.location.pathname, sessionId: sid });
      } catch {
        // 무시
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
