import styles from "./page.module.css";
import { zenKurenaido } from "./fonts";

const events: { title: string; theme: string; date: string; links: { name: string; description: string; url: string }[] }[] = [
  {
    title: "芸能祭",
    theme: "まぶしすぎて滅！",
    date: "2026/9/7(月)",
    links: []
  },
  {
    title: "体育祭",
    theme: "今日、勝ちにきました",
    date: "2026/9/9(水)",
    links: []
  },
  {
    title: "創作展",
    theme: "正解なんて創ればいい",
    date: "2026/9/12(土) ~ 2026/9/13(日)",
    links: [
      {
        name: "工具貸出",
        description: "工具の貸し出し状況を確認できます。",
        url: ""
      },
      {
        name: "情報伝達",
        description: "創作展委員会からの各クラスへの連絡を確認できます。",
        url: ""
      }
    ]
  }
];

export default function Home() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          2026行事週間
        </h1>
      </div>
      <div className={styles.main}>
        <h1 className={`${styles.theme} ${zenKurenaido.variable}`}>
          青、薫る
        </h1>
        <div className={styles.events}>
          {events.map((event, idx) => (
            <div key={idx}>
              <div className={styles.eventHeader}>
                <h2 className={styles.eventTitle}>{event.title}</h2>
                <span className={`${styles.eventTheme} ${zenKurenaido.variable}`}>
                  ～{event.theme}～
                </span>
              </div>
              <p className={styles.date}>開催日: {event.date}</p>
              <div className={styles.links}>
                {event.links.map((link, lIdx) => (
                  <div key={lIdx} className={styles.link}>
                    {link.url ? (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {link.name} ↗
                      </a>) : (
                      <span className={styles.linkTitlePreparing}>
                        {link.name} (準備中)
                      </span>
                    )}
                    <p className={styles.linkDescription}>
                      {link.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
