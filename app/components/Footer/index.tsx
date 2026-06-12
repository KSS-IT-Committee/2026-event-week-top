import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTheme}>
        <span>行事週間2026</span>
        <span>青、薫る</span>
      </div>
      <div>
        <span>© 2026 東京都立小石川中等教育学校</span>
        <span>行事運営委員会・IT委員会</span>
      </div>
    </footer>
  );
}
