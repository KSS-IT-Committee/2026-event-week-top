import styles from "./footer.module.css";

export function defaultFooter() {
  return (
    <footer className={styles.footer}>
      <h1 className={styles.footerTheme}>行事週間2026 青、薫る</h1>
      <p>© 2026 小石川中等教育学校</p>
      <p>行事運営委員会・IT委員会</p>
    </footer>
  );
}
