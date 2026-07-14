"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./not-found.module.css";

export default function Unauthorized() {
  // Carry the blocked page as ?next= so login returns the user here instead
  // of the top page (same return-trip AccountNavLink gives its login link).
  const pathname = usePathname();

  return (
    <>
      <div className={styles.wrapper}>
        <h1 className={styles.code}>401</h1>
        <p className={styles.title}>ログインが必要です</p>
        <p className={styles.subtitle}>
          このページを表示するにはログインしてください
        </p>
        <div className={styles.divider} />
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className={styles.homeLink}
        >
          ログインページへ
        </Link>
      </div>
    </>
  );
}
