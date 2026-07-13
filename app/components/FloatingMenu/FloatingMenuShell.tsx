"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./floating.module.css";

type FloatingMenuShellProps = {
  children: React.ReactNode;
};

/**
 * The interactive chrome of <FloatingMenu>: open/close state, hover handling
 * and the menu button. The links arrive as `children`, already rendered on
 * the server, because internal-only entries are gated by <Internal> — an
 * async Server Component that cannot run in the browser.
 *
 * Click/tap is the one open path that must always work. Hover open/close is
 * limited to `pointerType === "mouse"`: a tap's synthetic mouseenter would
 * otherwise open the menu mid-tap, swap the button to pointer-events: none,
 * and let the tail of the tap land on the nav underneath — the "menu needs
 * two taps on mobile" bug. For the same reason there is no timer-based
 * auto-collapse; a tap-opened menu stays open until an outside press, a link
 * click, Escape, or focus leaving it.
 *
 * Since the links are rendered on the server, `isOpen` can no longer be
 * stamped onto each one as `tabIndex`. `inert` does that job from an ancestor
 * instead: it makes the whole collapsed subtree unfocusable, unclickable and
 * hidden from assistive tech, so it also stands in for `aria-hidden` on the
 * same element.
 */
export function FloatingMenuShell({ children }: FloatingMenuShellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Collapse when a pointer press lands outside the menu.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      // Enter/leave on the wrapper covers the button and the nav as one
      // hover region, so the menu can't get stuck open when the pointer
      // skims the button without ever reaching the nav.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setIsOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          setIsOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      {/* Button first in DOM so that Tab after opening lands on the first
          link; both siblings are absolutely positioned, so order does not
          affect layout. */}
      <button
        ref={buttonRef}
        aria-expanded={isOpen}
        aria-controls="floating-menu-nav"
        type="button"
        className={`${styles.hamburger} ${
          isOpen ? styles.hidden : styles.visible
        }`}
        tabIndex={isOpen ? -1 : 0}
        onClick={() => setIsOpen(true)}
      >
        <span className={styles.bars} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        メニュー
      </button>

      <nav
        id="floating-menu-nav"
        inert={!isOpen}
        className={`${styles.menu} ${isOpen ? styles.visible : styles.hidden}`}
        aria-label="サイト内ナビゲーション"
        // The menu outlives page navigations (it is rendered from the
        // layout), so following a link must close it explicitly.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            setIsOpen(false);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        {children}
      </nav>
    </div>
  );
}
