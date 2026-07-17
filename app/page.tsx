import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Internal } from "@/app/components/Internal";
import { Schedule } from "@/app/components/schedule";

import { Countdown } from "./components/Countdown";
import { FloatingMenu } from "./components/FloatingMenu";
import { getNews } from "./news/newsData";
import { NewsItem } from "./news/newsItem";
import styles from "./top-page.module.css";

const latestNews = getNews()
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .slice(0, 4);

const geinousaiNews = getNews()
  .filter((data) => data.tag === "perform")
  .slice(0, 3);
const taiikusaiNews = getNews()
  .filter((data) => data.tag === "sport")
  .slice(0, 3);
const sousakutenNews = getNews()
  .filter((data) => data.tag === "create")
  .slice(0, 3);
const koyasaiNews = getNews()
  .filter((data) => data.tag === "ceremony")
  .slice(0, 3);
const ITcommitteeNews = getNews()
  .filter((data) => data.tag === "itcommittee")
  .slice(0, 3);

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
            sizes="(max-width: 768px) 80vw, 800px"
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

      <div className={styles.container}>
        {/* News */}
        <div id="news" className={styles.news}>
          <h1 className={styles.newsTitle}>News</h1>
          {latestNews.length === 0 ? (
            <p>お知らせはまだありません。</p>
          ) : (
            <ul className={styles.newsList}>
              {latestNews.map((item) => (
                <NewsItem key={item.id} item={item} />
              ))}
            </ul>
          )}
          <Link href="/news/list" className={styles.newsDetail}>
            もっと見る →
          </Link>
        </div>

        {/* Introduction */}
        <div className={styles.event}>
          <h1 className={styles.introductionTitle}>Introduction</h1>
          <p className={styles.text}>
            こちらは行事週間の総合サイトです！
            <br />
            各行事の最新情報やスケジュール、関連サイトへのリンクなどを掲載しています。
            <br />
            随時更新していきますので、ぜひチェックしてください！
            <br />
          </p>
          {/* Countdown */}
          <div className={styles.countdown}>
            <Countdown
              title="行事週間まであと"
              startedTitle="行事週間スタート!!"
              targetDate="2026-09-06T00:00:00+09:00"
            />
          </div>
        </div>

        {/* 芸能祭 */}
        <div id="performance" className={styles.event}>
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
            {geinousaiNews.length === 0 ? (
              <p>お知らせはまだありません。</p>
            ) : (
              <ul className={styles.eventNewsList}>
                {geinousaiNews.map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 体育祭 */}
        <div id="sports" className={styles.event}>
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
            {taiikusaiNews.length === 0 ? (
              <p>お知らせはまだありません。</p>
            ) : (
              <ul className={styles.eventNewsList}>
                {taiikusaiNews.map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>

          <Internal>
            <div className={styles.lead}>
              <p>↓体育祭サイトはこちらからアクセス</p>
            </div>
            <div className={styles.linkContainer}>
              <div className={styles.sportsSite}>
                <p
                  style={{
                    color: "#fff",
                    WebkitTextFillColor: "#fff",
                    opacity: 1,
                  }}
                >
                  体育祭サイト
                  <br />
                  （Coming Soon）
                </p>
              </div>
            </div>
          </Internal>
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
        <div id="create" className={styles.event}>
          <div className={styles.eventTop}>
            <h1 className={styles.createTitle}>創作展</h1>
            <Image
              className={styles.themeImage}
              src="/create-theme.png"
              alt="正解なんて創ればいい"
              width={400}
              height={100}
              sizes="(max-width: 1060px) 50vw, 400px"
            />
          </div>
          <div className={styles.content}>
            <p>《お知らせ》</p>
            {sousakutenNews.length === 0 ? (
              <p>お知らせはまだありません。</p>
            ) : (
              <ul className={styles.eventNewsList}>
                {sousakutenNews.map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
              </ul>
            )}
            <br />
          </div>

          <Internal>
            <div className={styles.lead}>
              <p>↓工具貸出サイト、情報伝達用サイトはこちらからアクセス</p>
            </div>
            <div className={styles.linkContainer}>
              <div className={styles.rentalSite}>
                <p
                  style={{
                    color: "#fff",
                    WebkitTextFillColor: "#fff",
                    opacity: 1,
                  }}
                >
                  工具貸出サイト
                  <br />
                  （Coming Soon）
                </p>
              </div>

              <div className={styles.informationSite}>
                <p
                  style={{
                    color: "#fff",
                    WebkitTextFillColor: "#fff",
                    opacity: 1,
                  }}
                >
                  情報発信サイト
                  <br />
                  （Coming Soon）
                </p>
              </div>
            </div>
          </Internal>
        </div>

        {/* 後夜祭 */}
        <div id="ceremony" className={styles.event}>
          <div className={styles.eventTop}>
            <h1 className={styles.ceremonyTitle}>後夜祭</h1>
            <Image
              className={styles.themeImage}
              src="/ceremony-theme.png"
              alt="最後まで、ハイライト"
              width={400}
              height={100}
              sizes="(max-width: 1060px) 50vw, 400px"
            />
          </div>
          <div className={styles.content}>
            <p>《お知らせ》</p>
            {koyasaiNews.length === 0 ? (
              <p>お知らせはまだありません。</p>
            ) : (
              <ul className={styles.eventNewsList}>
                {koyasaiNews.map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </div>
        {/* IT委員会ニュース */}
        <div id="itcommittee" className={styles.event}>
          <div className={styles.content}>
            <p>《IT委員会からのお知らせ》</p>
            {ITcommitteeNews.length === 0 ? (
              <p>お知らせはまだありません。</p>
            ) : (
              <ul className={styles.eventNewsList}>
                {ITcommitteeNews.map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </div>
        <FloatingMenu
          items={[
            { label: "芸能祭", href: "#performance" },
            { label: "体育祭", href: "#sports" },
            { label: "創作展", href: "#create" },
            { label: "後夜祭", href: "#ceremony" },
            // { label: "観覧抽選", href: "/lottery", isInternal: true },
            { label: "News", href: "/news/list" },
            { label: "ページ改善の提案", href: "/requests" },
            { label: "Changelog", href: "/changelog" },
          ]}
        />
      </div>
    </>
  );
}
