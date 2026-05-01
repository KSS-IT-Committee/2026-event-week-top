import styles from "./top-page.module.css";

export default function Toppage() {
  return (
    <>
      <header className={styles.header}>
        <br />
        <br />
        <br />
        <br />
        <br />
        <br />
        <h1 className={styles.theme}>青、薫る</h1>
        <h2 className={styles.top}>
          2026行事週間 <br />
          9/7~9/14
        </h2>
        <p className={styles.scroll}>Scroll</p>

        <svg
          className={styles.curveLine}
          viewBox="0 0 100 500"
          aria-hidden="true"
          focusable={false}
        >
          <defs>
            <linearGradient id="thickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.2" />
              <stop offset="50%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor="white" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            className={styles.flowLine}
            d="M 50 0 Q -40 250 50 550"
            stroke="url(#thickGrad)"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <br />
        <br />
      </header>

      <main className={styles.main}>
        <div className={styles.container}>
          {/* News */}
          <div className={styles.news}>
            <h1 className={styles.newsTitle}>News</h1>
          </div>

          {/* Introduction */}
          <div className={styles.event}>
            <h1 className={styles.introductionTitle}>Introduction</h1>
            <p className={styles.text}>
              こちらは行事週間の総合サイトです！様々な情報を発信していくのでお見逃しなく！
            </p>
          </div>

          {/* 芸能祭 */}
          <div className={styles.event}>
            <div className={styles.eventTop}>
              <h1 className={styles.performanceTitle}>芸能祭</h1>
              <p className={styles.performanceTheme}>~まぶしすぎて、滅！~</p>
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>お知らせはまだありません。</p>
            </div>
          </div>

          {/* 体育祭 */}
          <div className={styles.event}>
            <div className={styles.eventTop}>
              <h1 className={styles.sportsTitle}>体育祭</h1>
              <p className={styles.sportsTheme}>~今日、勝ちに来ました~</p>
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>お知らせはまだありません。</p>
            </div>
          </div>

          {/* 創作展 */}
          <div className={styles.event}>
            <div className={styles.eventTop}>
              <h1 className={styles.createTitle}>創作展</h1>
              <p className={styles.createTheme}>~正解なんて創ればいい~</p>
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>お知らせはまだありません。</p>
              <br />
            </div>

            <div className={styles.lead}>
              <p>↓工具貸出サイト、情報伝達用サイトはこちらからアクセス</p>
            </div>
            <div className={styles.linkContainer}>
              <div className={styles.rentalSite}>
                <a
                  href="https://github.com/KSS-IT-Committee/2026-sousakuten-equipment-management/app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  工具貸出サイト
                </a>
              </div>

              <div className={styles.informationSite}>
                <a
                  href="https://github.com/KSS-IT-Committee/2026-sousakuten-info/app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  情報発信サイト
                </a>
              </div>
            </div>
          </div>

          {/* 後夜祭 */}
          <div className={styles.event}>
            <div className={styles.eventTop}>
              <h1 className={styles.ceremonyTitle}>後夜祭</h1>
              <p className={styles.ceremonyTheme}>~最後まで、ハイライト~</p>
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>お知らせはまだありません。</p>
            </div>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <h1 className={styles.footerTheme}>行事週間2026 青、薫る</h1>
        <p>© 2026 小石川中等教育学校</p>
        <p>行事運営委員会・IT委員会</p>
      </footer>
    </>
  );
}
