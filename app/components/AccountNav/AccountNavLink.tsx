"use client";

import { type MouseEvent } from "react";

import styles from "./AccountNav.module.css";

type AccountNavLinkProps = {
  username: string | null;
  loginBaseUrl: string;
};

export function AccountNavLink({
  username,
  loginBaseUrl,
}: AccountNavLinkProps) {
  // Append the current page as `next` on a plain left-click, so a login
  // started here returns here (the /login page only honours `next` hosts in
  // the 2026 namespace). Modifier / middle clicks fall through to the bare
  // href so open-in-new-tab keeps working; with no JS the href is the login
  // page (you just land there without a return trip).
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const next = encodeURIComponent(window.location.href);
    window.location.href = `${loginBaseUrl}?next=${next}`;
  }

  const isLoggedIn = username !== null;
  return (
    <a
      className={styles.link}
      href={loginBaseUrl}
      onClick={handleClick}
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
