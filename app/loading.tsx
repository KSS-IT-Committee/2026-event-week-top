import styles from "./loading.module.css";

export default function Loading() {
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
