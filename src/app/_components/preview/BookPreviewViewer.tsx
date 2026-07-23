"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PageFlip } from "page-flip";
import type { CatalogTemplate } from "../catalog/templates";
import {
  previewSpreadsFor,
  PREVIEW_CTA_BUTTON,
  type PreviewSpread,
} from "./previewSpreads";
import styles from "./preview.module.css";

// F077 — 책 미리보기 뷰어. Full-screen dialog; the flip unit is a whole 펼침면 (10:7
// spread — see previewSpreads.ts). Two view modes:
//   "book" (≥768px)  — each spread split into left/right 5:7 pages, so StPageFlip's fold
//                      lands on the 책등 (gutter), like a real book;
//   "leaf" (<768px)  — each spread is ONE portrait-mode leaf, shown whole (fit-width on
//                      the panel mat) — never half a scene on a phone.
// page-flip is dynamically imported only when the viewer opens (zero cost on the order
// page bundle). prefers-reduced-motion — or a failed import — falls back to a crossfade
// of the same spreads (DESIGN.md motion hard guard).
//
// The spread pages are built imperatively (document.createElement) inside the effect:
// StPageFlip re-parents and re-styles the page nodes, which must not fight React's DOM
// ownership — React only owns the empty host <div>.

const DESKTOP_MQ = "(min-width: 768px)";
const REDUCED_MQ = "(prefers-reduced-motion: reduce)";

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The full 10:7 spread composition. `side` marks which half this copy will actually
 * show once clipped ("full" = leaf/fade, uncut): interactive elements (the CTA button)
 * are only created on the copy where they are visible, so clipped-away duplicates can
 * never be reached by keyboard focus.
 */
function buildCanvas(
  spread: PreviewSpread,
  spreadNo: number,
  side: "full" | "left" | "right",
  onCta: () => void,
): HTMLElement {
  const isBleed = spread.kind === "story" && spread.layout === "bleed";
  const canvas = make(
    "div",
    isBleed ? `${styles.canvas} ${styles.bleed}` : `${styles.canvas} ${styles.split}`,
  );

  if (spread.kind === "story") {
    if (spread.layout === "bleed") {
      canvas.appendChild(make("p", styles.storyText, spread.text));
    } else {
      const cellText = make("div", styles.cellText);
      cellText.appendChild(make("p", styles.storyText, spread.text));
      const cellArt = make("div", styles.cellArt);
      cellArt.appendChild(make("span", styles.artLabel, "Illustration"));
      cellArt.appendChild(
        make("p", styles.artNote, "아이의 그림이 이곳에 그려집니다"),
      );
      canvas.appendChild(cellText);
      canvas.appendChild(cellArt);
    }
  } else {
    const cellText = make("div", `${styles.cellText} ${styles.ctaCell}`);
    cellText.appendChild(make("p", styles.ctaLine, spread.text));
    const cellCta = make("div", styles.ctaCell);
    if (side !== "left") {
      const button = make("button", "cta", PREVIEW_CTA_BUTTON);
      button.type = "button";
      button.dataset.testid = "preview-cta";
      button.addEventListener("click", onCta);
      cellCta.appendChild(button);
    }
    canvas.appendChild(cellText);
    canvas.appendChild(cellCta);
  }

  // Printed-book page numbers: spread n = pages 2n-1 · 2n.
  const left = make("span", `${styles.pageNo} ${styles.pageNoLeft}`);
  left.textContent = String(spreadNo * 2 - 1).padStart(2, "0");
  const right = make("span", `${styles.pageNo} ${styles.pageNoRight}`);
  right.textContent = String(spreadNo * 2).padStart(2, "0");
  canvas.appendChild(left);
  canvas.appendChild(right);
  return canvas;
}

function buildPages(
  spreads: PreviewSpread[],
  format: "flip-leaf" | "flip-book" | "fade",
  onCta: () => void,
): HTMLElement[] {
  if (format === "flip-book") {
    return spreads.flatMap((spread, i) => {
      const pageOf = (whichSide: "left" | "right") => {
        const page = make("div", styles.page);
        const half = make(
          "div",
          whichSide === "right" ? `${styles.half} ${styles.halfRight}` : styles.half,
        );
        const inner = make("div", styles.halfInner);
        inner.appendChild(buildCanvas(spread, i + 1, whichSide, onCta));
        half.appendChild(inner);
        page.appendChild(half);
        return page;
      };
      return [pageOf("left"), pageOf("right")];
    });
  }
  return spreads.map((spread, i) => {
    const page = make(
      "div",
      format === "fade" ? `${styles.page} ${styles.fadePage}` : styles.page,
    );
    page.appendChild(buildCanvas(spread, i + 1, "full", onCta));
    return page;
  });
}

/** StPageFlip settings per view mode. 10:7 spread ⇒ leaf page 10:7, book page 5:7. */
function flipSettings(mode: "book" | "leaf") {
  const base = {
    size: "stretch" as const,
    drawShadow: true,
    maxShadowOpacity: 0.1, // DESIGN.md: no heavy shadows — a breath of fold, not a drop shadow
    flippingTime: 600, // DESIGN.md motion budget 200–700ms
    showCover: false,
    autoSize: true,
    mobileScrollSupport: true,
    clickEventForward: true,
    useMouseEvents: true,
    swipeDistance: 30,
    showPageCorners: true,
    disableFlipByClick: true, // corners/drag/swipe flip; taps on content never mis-flip
    startPage: 0,
    startZIndex: 0,
  };
  return mode === "book"
    ? // 5:7 half-spread pages; usePortrait:false pins two-page landscape.
      { ...base, usePortrait: false, width: 340, height: 476, minWidth: 180, maxWidth: 720, minHeight: 252, maxHeight: 1008 }
    : // 10:7 whole-spread leaves; minWidth 280 + the stage's 540px CSS cap keeps
      // blockWidth < 2*minWidth ⇒ StPageFlip stays portrait (single leaf), always.
      { ...base, usePortrait: true, width: 500, height: 350, minWidth: 280, maxWidth: 1000, minHeight: 196, maxHeight: 700 };
}

export function BookPreviewViewer({
  template,
  onClose,
  onCta,
}: {
  template: CatalogTemplate;
  onClose: () => void;
  /**
   * F078 — what the last spread's CTA ('이 책 만들기') does. Defaults to onClose (the
   * wizard context: the buyer is already ON the order page, so closing IS the action).
   * Category-card entry passes a router push into /order/<key> instead.
   */
  onCta?: () => void;
}) {
  const spreads = useMemo(() => previewSpreadsFor(template), [template]);
  const total = spreads.length;
  const [index, setIndex] = useState(0);
  // Client-only component (mounted on click, never SSR'd) — window is safe in initializers.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_MQ).matches);
  const [reduced] = useState(() => window.matchMedia(REDUCED_MQ).matches);
  const [engineFailed, setEngineFailed] = useState(false);
  const mode = isDesktop ? "book" : "leaf";
  const useFlip = !reduced && !engineFailed;

  const overlayRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<PageFlip | null>(null);
  const indexRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const onCtaRef = useRef(onCta ?? onClose);

  // F079 — leaf-only zoom. One step (fit-height, measured at toggle time); while
  // zoomed the flip is LOCKED and dragging pans instead. The scale/translate live on
  // .zoomPane — OUTSIDE the engine-owned .bookMount, whose inline styles StPageFlip
  // rewrites (F077 함정: autoSize forces width:100% on the mount, UI.ts:60).
  const [zoomed, setZoomed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookBoxRef = useRef<HTMLDivElement>(null);
  const zoomPaneRef = useRef<HTMLDivElement>(null);
  const zoomedRef = useRef(false);
  const zoomScaleRef = useRef(1);
  const panPosRef = useRef({ x: 0, y: 0 });
  // Tap / pinch / drag tracker shared by the two gesture surfaces: the .book box
  // (zoom-in) and the pan capture layer (pan + zoom-out). Pointer events unify
  // mouse and touch, so the same FSM serves both input kinds.
  const gestureRef = useRef({
    points: new Map<number, { x: number; y: number }>(),
    pinchStartDist: 0,
    tap: { id: null as number | null, x: 0, y: 0, t: 0, moved: false },
    lastTap: { t: 0, x: 0, y: 0 },
    drag: null as null | { id: number; x: number; y: number; startX: number; startY: number },
  });

  /** Write the current zoom/pan onto the pane (imperative — pan must not re-render). */
  const applyZoomTransform = useCallback(() => {
    const pane = zoomPaneRef.current;
    if (!pane) return;
    if (!zoomedRef.current) {
      pane.style.transform = "";
      return;
    }
    const { x, y } = panPosRef.current;
    pane.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoomScaleRef.current})`;
  }, []);

  /** Keep the scaled spread's edges pinned to the stage (no panning into the void). */
  const clampPan = useCallback((x: number, y: number) => {
    const stage = stageRef.current;
    const book = bookBoxRef.current;
    if (!stage || !book) return { x: 0, y: 0 };
    const k = zoomScaleRef.current;
    const maxX = Math.max(0, (book.clientWidth * k - stage.clientWidth) / 2);
    const maxY = Math.max(0, (book.clientHeight * k - stage.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, []);

  const setZoom = useCallback(
    (on: boolean) => {
      if (on) {
        const stage = stageRef.current;
        const book = bookBoxRef.current;
        if (!stage || !book) return;
        // fit-height, single step (다단계 배율은 비목표) — measured live so the bar
        // heights, safe-area inset and the 540px width cap are all accounted for.
        const k = stage.clientHeight / Math.max(1, book.clientHeight);
        zoomScaleRef.current = Math.round(Math.min(4, Math.max(1, k)) * 100) / 100;
      }
      panPosRef.current = { x: 0, y: 0 };
      zoomedRef.current = on;
      setZoomed(on);
      applyZoomTransform();
    },
    [applyZoomTransform],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      panPosRef.current = clampPan(panPosRef.current.x + dx, panPosRef.current.y + dy);
      applyZoomTransform();
    },
    [applyZoomTransform, clampPan],
  );

  const onZoomSurfacePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    g.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.points.size === 2) {
      // A pinch begins — it supersedes tap and drag tracking.
      const [a, b] = Array.from(g.points.values());
      g.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.tap.id = null;
      g.drag = null;
      zoomPaneRef.current?.classList.remove(styles.dragging);
      return;
    }
    g.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (zoomedRef.current) {
      g.drag = {
        id: e.pointerId,
        x: panPosRef.current.x,
        y: panPosRef.current.y,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      zoomPaneRef.current?.classList.add(styles.dragging); // pan tracks 1:1 — no easing lag
    }
  }, []);

  const onZoomSurfacePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (g.points.has(e.pointerId)) g.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.points.size === 2 && g.pinchStartDist > 0) {
        const [a, b] = Array.from(g.points.values());
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / g.pinchStartDist;
        // One-step zoom ⇒ pinch is a toggle: spread far enough to enlarge, squeeze to restore.
        if (!zoomedRef.current && ratio > 1.3) {
          g.pinchStartDist = 0;
          setZoom(true);
        } else if (zoomedRef.current && ratio < 0.75) {
          g.pinchStartDist = 0;
          setZoom(false);
        }
        return;
      }
      if (g.tap.id === e.pointerId && Math.hypot(e.clientX - g.tap.x, e.clientY - g.tap.y) > 12) {
        g.tap.moved = true;
      }
      if (zoomedRef.current && g.drag && g.drag.id === e.pointerId) {
        panPosRef.current = clampPan(
          g.drag.x + (e.clientX - g.drag.startX),
          g.drag.y + (e.clientY - g.drag.startY),
        );
        applyZoomTransform();
      }
    },
    [applyZoomTransform, clampPan, setZoom],
  );

  const onZoomSurfacePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      g.points.delete(e.pointerId);
      if (g.points.size < 2) g.pinchStartDist = 0;
      if (g.drag?.id === e.pointerId) {
        g.drag = null;
        zoomPaneRef.current?.classList.remove(styles.dragging);
      }
      if (g.tap.id !== e.pointerId) return;
      const now = performance.now();
      const isTap = !g.tap.moved && now - g.tap.t < 300;
      g.tap.id = null;
      if (!isTap) return;
      const isDouble =
        now - g.lastTap.t < 320 &&
        Math.hypot(e.clientX - g.lastTap.x, e.clientY - g.lastTap.y) < 40;
      if (isDouble) {
        g.lastTap.t = 0;
        setZoom(!zoomedRef.current); // ② gesture sugar — double-tap toggles the same state
      } else {
        g.lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    },
    [setZoom],
  );

  const onZoomSurfacePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    g.points.delete(e.pointerId);
    if (g.points.size < 2) g.pinchStartDist = 0;
    if (g.drag?.id === e.pointerId) {
      g.drag = null;
      zoomPaneRef.current?.classList.remove(styles.dragging);
    }
    if (g.tap.id === e.pointerId) g.tap.id = null;
  }, []);

  // Zoom is leaf-only: crossing into book mode (rotation/breakpoint) restores 1:1.
  useEffect(() => {
    if (mode !== "leaf" && zoomedRef.current) setZoom(false);
  }, [mode, setZoom]);

  useEffect(() => {
    onCloseRef.current = onClose;
    onCtaRef.current = onCta ?? onClose;
  }, [onClose, onCta]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Rebuild on breakpoint crossings (leaf ↔ book page DOM differs).
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Scroll lock + initial focus while the dialog is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const goPrev = useCallback(() => {
    if (zoomedRef.current) return; // F079 — flip locked while zoomed
    const engine = engineRef.current;
    if (engine) engine.flipPrev();
    else setIndex((i) => Math.max(i - 1, 0));
  }, []);
  const goNext = useCallback(() => {
    if (zoomedRef.current) return; // F079 — flip locked while zoomed
    const engine = engineRef.current;
    if (engine) engine.flipNext();
    else setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  // Build the book: imperative pages + (unless reduced/failed) the flip engine.
  useEffect(() => {
    const host = bookRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: PageFlip | null = null;
    const format = !useFlip ? "fade" : mode === "book" ? "flip-book" : "flip-leaf";
    const pages = buildPages(spreads, format, () => onCtaRef.current());
    host.classList.toggle(styles.bookFade, !useFlip);
    for (const p of pages) host.appendChild(p);

    if (useFlip) {
      import("page-flip")
        .then((mod) => {
          if (cancelled) return;
          engine = new mod.PageFlip(host, flipSettings(mode));
          engine.loadFromHTML(pages);
          // Restore position across a breakpoint rebuild.
          if (indexRef.current > 0)
            engine.turnToPage(mode === "book" ? indexRef.current * 2 : indexRef.current);
          engine.on("flip", (e) => {
            if (!engine) return;
            const raw = typeof e.data === "number" ? e.data : engine.getCurrentPageIndex();
            setIndex(mode === "book" ? Math.floor(raw / 2) : raw);
          });
          engineRef.current = engine;
        })
        .catch(() => {
          if (!cancelled) setEngineFailed(true); // → fade fallback rebuild
        });
    }

    return () => {
      cancelled = true;
      engineRef.current = null;
      try {
        engine?.destroy();
      } catch {
        // best-effort teardown — the host is wiped below either way
      }
      host.classList.remove(styles.bookFade);
      host.innerHTML = "";
    };
  }, [spreads, mode, useFlip]);

  // Fade fallback: show exactly the current spread (visibility keeps tab order honest).
  useEffect(() => {
    if (useFlip) return;
    const host = bookRef.current;
    if (!host) return;
    Array.from(host.children).forEach((el, i) => {
      el.classList.toggle(styles.fadePageActive, i === index);
    });
  }, [index, useFlip, mode, spreads]);

  // Esc closes · arrows page · Tab cycles inside the dialog (visible controls only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      // F079 — zoomed: arrow keys PAN (the keyboard twin of drag; flip stays locked).
      if (
        zoomedRef.current &&
        (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        e.preventDefault();
        const step = 48;
        panBy(
          e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0,
          e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0,
        );
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "Tab") {
        const root = overlayRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"),
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, panBy]);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`『${template.label}』 미리보기`}
      data-testid="preview-dialog"
      data-mode={mode}
      data-zoomed={zoomed ? "true" : "false"}
    >
      <div className={styles.topBar}>
        <div className={styles.titleGroup}>
          <span className={styles.kicker}>Preview</span>
          <p className={styles.bookTitle}>『{template.label}』</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          data-testid="preview-close"
        >
          닫기 ✕
        </button>
      </div>

      <div ref={stageRef} className={styles.stage}>
        {/* Zoom-in gesture surface (leaf only): taps bubble up from the engine's pages. */}
        <div
          ref={bookBoxRef}
          className={styles.book}
          data-testid="preview-stage"
          onPointerDown={mode === "leaf" ? onZoomSurfacePointerDown : undefined}
          onPointerMove={mode === "leaf" ? onZoomSurfacePointerMove : undefined}
          onPointerUp={mode === "leaf" ? onZoomSurfacePointerUp : undefined}
          onPointerCancel={mode === "leaf" ? onZoomSurfacePointerCancel : undefined}
        >
          {/* The zoom transform lives HERE — never on .bookMount (engine-owned inline styles). */}
          <div ref={zoomPaneRef} className={styles.zoomPane} data-testid="preview-zoom-pane">
            <div ref={bookRef} className={styles.bookMount} />
          </div>
        </div>
        {zoomed ? (
          // Pan capture layer: physically blocks pointers from reaching StPageFlip
          // (the flip lock), hosts drag-to-pan, double-tap-out and pinch-in. Not a
          // focus stop — keyboard panning goes through the arrow keys instead.
          <div
            className={styles.panLayer}
            data-testid="preview-pan-layer"
            aria-hidden="true"
            onPointerDown={onZoomSurfacePointerDown}
            onPointerMove={onZoomSurfacePointerMove}
            onPointerUp={onZoomSurfacePointerUp}
            onPointerCancel={onZoomSurfacePointerCancel}
          />
        ) : null}
      </div>

      <div className={styles.bottomBar}>
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navBtnPrev}`}
          onClick={goPrev}
          disabled={index === 0 || zoomed}
          data-testid="preview-prev"
        >
          <span className={styles.navArrow} aria-hidden="true">
            ←
          </span>
          이전 장
        </button>
        <div className={styles.center}>
          <p className={styles.indicator} aria-live="polite" data-testid="preview-indicator">
            {index + 1} / {total}
          </p>
          <p className={styles.rotateHint} data-testid="preview-rotate-hint">
            휴대폰을 가로로 돌리면 더 크게 볼 수 있어요
          </p>
          {mode === "leaf" ? (
            // F079 ① — the explicit, keyboardable zoom path (gestures are sugar only).
            <button
              type="button"
              className={styles.zoomToggle}
              onClick={() => setZoom(!zoomed)}
              aria-pressed={zoomed}
              data-testid="preview-zoom"
            >
              크게 보기
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navBtnNext}`}
          onClick={goNext}
          disabled={index === total - 1 || zoomed}
          data-testid="preview-next"
        >
          다음 장
          <span className={styles.navArrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
