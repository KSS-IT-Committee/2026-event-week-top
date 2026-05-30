import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { news } from "./news/newsData";
import { NewsItem } from "./news/newsItem";
import styles from "./top-page.module.css";


const latestNews = [...news]
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .slice(0, 4);

const geinousaiNews = news
  .filter((item) => item.tag === "perform")
  .slice(0, 3);
const taiikusaiNews = news
  .filter((item) => item.tag === "sport")
  .slice(0, 3); 
const sousakutenNews = news
  .filter((item) => item.tag === "create")
  .slice(0, 3);
const koyasaiNews = news
  .filter((item) => item.tag === "ceremony")
  .slice(0, 3);

export const metadata: Metadata = {
  title: "2026年度行事週間",
  description: "2026年度行事週間 トップページ",
};

console.log("NEWS DATA:", news);

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

      <main className={styles.main}>
        <div className={styles.container}>
          {/* News */}
            <div className={styles.news}>
             <h1 className={styles.newsTitle}>News</h1>
             <ul className={styles.newsList}>
             {latestNews.map((item) => (
             <NewsItem key={item.id} item={item} />
             ))}
             </ul>
             <Link href="/news/list" className={styles.newsDetail}>
              もっと見る →
             </Link>
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
          </div>

          {/* 創作展 */}
          <div className={styles.event}>
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
        </div>
      </main>

      <Footer />
    </>
  );
}
