"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./InternalNotice.module.css";

export function InternalNotice() {
  const [isOpen, setIsOpen] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={() => setIsOpen(false)}
      role="presentation"
    >
      <div
        aria-describedby="internal-notice-body"
        aria-labelledby="internal-notice-title"
        aria-modal="true"
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className={styles.title} id="internal-notice-title">
          このページは外部の方向けです
        </h2>
        <div className={styles.body} id="internal-notice-body">
          <p>
            生徒・教職員の方は、このページの申し込みフォームではなく
            <Link className={styles.link} href="/lottery">
              校内向け申込ページ
            </Link>
            からお申し込みください。
          </p>
          <p className={styles.note}>
            保護者の方も、お子様のアカウントでログインのうえ校内向け申込ページからお申し込みいただけます。
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/lottery">
            校内向け申込ページへ
          </Link>
          <button
            className={styles.secondaryAction}
            onClick={() => setIsOpen(false)}
            ref={closeButtonRef}
            type="button"
          >
            このまま閲覧する
          </button>
        </div>
      </div>
    </div>
  );
}
