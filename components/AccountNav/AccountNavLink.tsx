"use client";

import { useEffect, useState } from "react";

import styles from "./AccountNav.module.css";

type AccountNavLinkProps = {
  username: string | null;
  loginBaseUrl: string;
};

export function AccountNavLink({
  username,
  loginBaseUrl,
}: AccountNavLinkProps) {
  // Point the login link back at the current page so a login started here
  // returns here. Set after mount so it captures the real browser URL
  // (correct even across subdomains); the /login page only honours `next`
  // hosts in the 2026 namespace.
  const [href, setHref] = useState(loginBaseUrl);
  useEffect(() => {
    setHref(`${loginBaseUrl}?next=${encodeURIComponent(window.location.href)}`);
  }, [loginBaseUrl]);

  const isLoggedIn = username !== null;
  return (
    <a
      className={styles.link}
      href={href}
      aria-label={isLoggedIn ? `${username} としてログイン中` : "ログイン"}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span className={styles.label}>{isLoggedIn ? username : "ログイン"}</span>
    </a>
  );
}
