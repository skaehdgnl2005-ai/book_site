"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadCart, CART_CHANGED_EVENT } from "@/lib/cart";
import styles from "./nav.module.css";

// F049 — nav with a BAG (cart) entry point + the mobile drawer from the DESIGN.md Nav
// spec (dark panel, ivory links). Client component: the BAG count reads localStorage
// (SSR renders a bare "BAG"; the count mounts in an effect, so hydration matches).
// The bar reuses the shared .site-nav / .nav-link classes from globals.css (read-only).

const CATEGORY_LINKS = [
  { href: "/anniversary", label: "기념일" },
  { href: "/first-moments", label: "첫 순간들" },
  { href: "/custom", label: "맞춤 제작" },
  // Post-purchase entry: the finishing flow (photo/dedication) lives behind
  // the mypage lookup — without this link buyers had no way back in.
  { href: "/mypage", label: "주문 조회" },
] as const;

// Content pages — same set the footer surfaces (F048); the drawer is the mobile
// counterpart so they stay reachable without scrolling to the footer.
const CONTENT_LINKS = [
  { href: "/brand-story", label: "브랜드 스토리" },
  { href: "/gallery", label: "갤러리" },
  { href: "/reviews", label: "후기" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/contact", label: "문의" },
] as const;

const DRAWER_ID = "site-nav-drawer";

function BagLabel({ count }: { count: number }) {
  return (
    <>
      BAG
      {count > 0 && (
        <>
          {" "}
          <span className={styles.bagCount}>{count}</span>
        </>
      )}
    </>
  );
}

export function NavClient({ overlay = false }: { overlay?: boolean }) {
  const [bagCount, setBagCount] = useState(0); // 0 on SSR/first client render → "BAG"
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const sync = () => setBagCount(loadCart().lines.length);
    sync();
    // Same-tab cart mutations (e.g. F051 line delete on /cart) fire CART_CHANGED_EVENT;
    // "storage" covers other-tab changes. Both re-read so the BAG count never goes stale.
    window.addEventListener(CART_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Focus management: into the drawer on open, back to the hamburger on close.
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      menuButtonRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // Escape closes; Tab is trapped inside the drawer while it is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = drawerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <nav
      className={[
        overlay ? "site-nav site-nav--overlay" : "site-nav",
        overlay ? styles.overlay : "",
      ]
        .join(" ")
        .trim()}
      aria-label="주요 메뉴"
    >
      <Link href="/" className="site-nav__brand">
        그림책 제작소
      </Link>

      <div className={styles.right}>
        <ul className={`site-nav__links ${styles.links}`}>
          {CATEGORY_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="nav-link">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Cart entry point — text only (no badge/dot: quiet by design). */}
        <Link href="/cart" className="nav-link" data-testid="nav-bag">
          <BagLabel count={bagCount} />
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-label="메뉴 열기"
          aria-expanded={open}
          aria-controls={DRAWER_ID}
          data-testid="nav-menu-button"
          onClick={() => setOpen(true)}
        >
          <span className={styles.bar} aria-hidden="true" />
          <span className={styles.bar} aria-hidden="true" />
          <span className={styles.bar} aria-hidden="true" />
        </button>
      </div>

      {/* Backdrop — click closes. A real <button> so it needs no key handler of its own. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={open ? `${styles.backdrop} ${styles.backdropOpen}` : styles.backdrop}
        onClick={close}
      />

      <div
        ref={drawerRef}
        id={DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label="메뉴"
        data-testid="nav-drawer"
        className={open ? `${styles.drawer} ${styles.drawerOpen}` : styles.drawer}
        // React 19 boolean `inert`: while closed the offscreen drawer is untabbable
        // and invisible to AT (visibility:hidden in the module handles paint).
        inert={!open}
      >
        <div className={styles.drawerHead}>
          <span className={styles.drawerLabel}>Menu</span>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label="메뉴 닫기"
            data-testid="nav-drawer-close"
            onClick={close}
          >
            닫기
          </button>
        </div>

        <ul className={styles.drawerList}>
          {CATEGORY_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={styles.drawerLink} onClick={close}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/cart" className={styles.drawerLink} onClick={close}>
              <BagLabel count={bagCount} />
            </Link>
          </li>
        </ul>

        <ul className={`${styles.drawerList} ${styles.drawerContentList}`}>
          {CONTENT_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={styles.drawerLink} onClick={close}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
