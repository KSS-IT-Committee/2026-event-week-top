import type { Metadata } from "next";
import Image from "next/image";

import { Schedule } from "@/app/components/schedule";
import { Footer } from "@/components/Footer";

import styles from "./top-page.module.css";

export const metadata: Metadata = {
  title: "2026年度行事週間",
  description: "2026年度行事週間 トップページ",
};

export default function Toppage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.themeContainer}>
          <Image
            className={styles.theme}
            src="/theme.png"
            alt="青、薫る"
            width={700}
            height={300}
            priority
          />
        </div>
        <p className={styles.scroll}>Scroll</p>

        <svg
          className={styles.curveLine}
          viewBox="0 0 100 550"
          aria-hidden="true"
          focusable={false}
        >
          <defs>
            <linearGradient id="thickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(49, 108, 184)"
                stopOpacity="0.2"
              />
              <stop
                offset="50%"
                stopColor="rgb(49, 108, 184)"
                stopOpacity="0.6"
              />
              <stop
                offset="100%"
                stopColor="rgb(49, 108, 184)"
                stopOpacity="0.95"
              />
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
              <Image
                className={styles.themeImage}
                src="/performance-theme.svg"
                alt="まぶしすぎて滅！"
                width={400}
                height={100}
              />
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
              <Image
                className={styles.themeImage}
                src="/sports-theme.svg"
                alt="今日、勝ちにきました"
                width={400}
                height={100}
              />
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>2026/05/24 予備大の日程が公開されました。</p>
            </div>
            <div className={styles.sportsGrid}>
              <section className={styles.sportItem}>
                <h2 className={styles.sportName}>サッカー</h2>
                <Schedule
                  subject="サッカー"
                  items={[
                    { label: "予選AB", date: "2026/05/28" },
                    { label: "予選CD", date: "2026/06/01" },
                    { label: "三位決定戦", date: "2026/06/04" },
                    { label: "決勝", date: "2026/06/08" },
                    { label: "予備", date: "2026/06/11", muted: true },
                  ]}
                />
              </section>
              <section className={styles.sportItem}>
                <h2 className={styles.sportName}>ドッヂボール</h2>
                <Schedule
                  subject="ドッヂボール"
                  items={[
                    { label: "試合", date: "2026/05/29" },
                    { label: "予備", date: "2026/06/05", muted: true },
                  ]}
                />
              </section>
              <section className={styles.sportItem}>
                <h2 className={styles.sportName}>バスケットボール</h2>
                <Schedule
                  subject="バスケットボール"
                  items={[
                    { label: "予選AB", date: "2026/06/02" },
                    { label: "予選CD", date: "2026/06/15" },
                  ]}
                />
              </section>
              <section className={styles.sportItem}>
                <h2 className={styles.sportName}>バレーボール</h2>
                <Schedule
                  subject="バレーボール"
                  items={[
                    { label: "予選", date: "2026/06/16" },
                    { label: "決勝", date: "2026/06/17" },
                  ]}
                />
              </section>
            </div>
          </div>

          {/* 創作展 */}
          <div className={styles.event}>
            <div className={styles.eventTop}>
              <h1 className={styles.createTitle}>創作展</h1>
              <Image
                className={styles.themeImage}
                src="/create-theme.svg"
                alt="正解なんて創ればいい"
                width={400}
                height={100}
              />
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
              <Image
                className={styles.themeImage}
                src="/ceremony-theme.svg"
                alt="最後まで、ハイライト"
                width={400}
                height={100}
              />
            </div>
            <div className={styles.content}>
              <p>《お知らせ》</p>
              <p>お知らせはまだありません。</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
