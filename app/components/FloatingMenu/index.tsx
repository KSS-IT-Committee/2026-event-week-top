"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./floating.module.css";

const DEFAULT_COLLAPSE_DELAY_MS = 2000;

export type FloatingMenuItem = {
  label: string;
  href: string;
};

type FloatingMenuProps = {
  items: FloatingMenuItem[];
  collapseDelayMs?: number;
};

export function FloatingMenu({
  items,
  collapseDelayMs = DEFAULT_COLLAPSE_DELAY_MS,
}: FloatingMenuProps) {
  const [isOpen, setIsOpen] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    scheduleCollapse();
    return () => cancelCollapse();
  }, [scheduleCollapse, cancelCollapse]);

  const handleOpen = () => {
    setIsOpen(true);
    scheduleCollapse();
  };

  return (
    <div className={styles.wrapper}>
      <nav
        className={`${styles.menu} ${isOpen ? styles.visible : styles.hidden}`}
        aria-label="ページ内ナビゲーション"
        onMouseEnter={cancelCollapse}
        onMouseLeave={scheduleCollapse}
        onFocus={cancelCollapse}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            scheduleCollapse();
          }
        }}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.link}
            tabIndex={isOpen ? 0 : -1}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
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
