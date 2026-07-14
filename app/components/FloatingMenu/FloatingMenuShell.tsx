"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./floating.module.css";

const DEFAULT_COLLAPSE_DELAY_MS = 2000;

type FloatingMenuShellProps = {
  children: React.ReactNode;
  collapseDelayMs?: number;
};

/**
 * The interactive chrome of <FloatingMenu>: collapse timer, hover/focus
 * handling and the hamburger. The links arrive as `children`, already rendered
 * on the server, because internal-only entries are gated by <Internal> — an
 * async Server Component that cannot run in the browser.
 *
 * Since the links are rendered on the server, `isOpen` can no longer be stamped
 * onto each one as `tabIndex`. `inert` does that job from an ancestor instead:
 * it makes the whole collapsed subtree unfocusable, unclickable and hidden from
 * assistive tech, so it also stands in for `aria-hidden` on the same element.
 */
export function FloatingMenuShell({
  children,
  collapseDelayMs = DEFAULT_COLLAPSE_DELAY_MS,
}: FloatingMenuShellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const scheduleCollapse = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsOpen(false), collapseDelayMs);
  }, [collapseDelayMs]);

  const cancelCollapse = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const collapseNow = useCallback(() => {
    cancelCollapse();
    setIsOpen(false);
  }, [cancelCollapse]);

  useEffect(() => {
    scheduleCollapse();
    return () => cancelCollapse();
  }, [scheduleCollapse, cancelCollapse]);

  // Collapse when a pointer press lands outside the menu.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        collapseNow();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, collapseNow]);

  // On devices with a mouse, collapse when the pointer leaves the viewport.
  useEffect(() => {
    if (!isOpen) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const handleMouseOut = (event: MouseEvent) => {
      // relatedTarget is null when the pointer leaves the browser window.
      if (event.relatedTarget === null) {
        collapseNow();
      }
    };

    document.addEventListener("mouseout", handleMouseOut);
    return () => document.removeEventListener("mouseout", handleMouseOut);
  }, [isOpen, collapseNow]);

  const handleOpen = () => {
    setIsOpen(true);
    scheduleCollapse();
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <nav
        id="floating-menu-nav"
        inert={!isOpen}
        className={`${styles.menu} ${isOpen ? styles.visible : styles.hidden}`}
        aria-label="ページ内ナビゲーション"
        onMouseEnter={cancelCollapse}
        onMouseLeave={collapseNow}
        onFocus={cancelCollapse}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            collapseNow();
          }
        }}
      >
        {children}
      </nav>

      <button
        aria-expanded={isOpen}
        aria-controls="floating-menu-nav"
        type="button"
        className={`${styles.hamburger} ${
          isOpen ? styles.hidden : styles.visible
        }`}
        aria-label="メニューを開く"
        tabIndex={isOpen ? -1 : 0}
        onClick={handleOpen}
        onMouseEnter={handleOpen}
        onFocus={handleOpen}
      >
        <span />
        <span />
        <span />
      </button>
    </div>
  );
}
