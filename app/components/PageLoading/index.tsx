import styles from "./PageLoading.module.css";

/**
 * Full-page loading indicator, used as the `fallback` of a `<Suspense>`
 * boundary inside a page.
 *
 * This replaces the old `app/loading.tsx`. A `loading.tsx` wraps the WHOLE
 * route in a Suspense boundary, so Next.js flushes the response headers
 * before the page renders — after that the status code is frozen at 200 and
 * `unauthorized()` / `forbidden()` / `notFound()` render their page with a
 * misleading 200. Declaring the boundary by hand lets us put it BELOW the
 * code that decides the status (AuthGuard, notFound checks), which therefore
 * still runs while the status line is writable.
 *
 * Rule of thumb when adding a boundary: everything that can interrupt with a
 * status code must render OUTSIDE it.
 */
export function PageLoading() {
  return (
    <div className={styles.wrapper} role="status">
      <div className={styles.dots} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <p className={styles.label}>読み込み中</p>
    </div>
  );
}
