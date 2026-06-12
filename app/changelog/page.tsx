import type { Metadata } from "next";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import { Footer } from "@/app/components/Footer";
import changelog from "@/lib/changelog.generated.json";

import styles from "./changelog.module.css";

type Entry = {
  slug: string;
  title: string;
  description: string;
  credits: string[];
  addedAt: string;
  commit: string | null;
};

const COMMIT_URL_BASE =
  "https://github.com/KSS-IT-Committee/2026-event-week-top/commit/";

export const metadata: Metadata = {
  title: "Changelog | 行事週間2026",
  description: "サイトの更新履歴",
};

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});

export default function ChangelogPage() {
  const entries = changelog as Entry[];

  return (
    <>
      <main className={styles.main}>
        <h1 className={styles.title}>Changelog</h1>
        <p className={styles.subtitle}>サイトの更新履歴</p>

        {entries.length === 0 ? (
          <p className={styles.empty}>まだ更新はありません。</p>
        ) : (
          <ol className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.slug} className={styles.entry}>
                <div className={styles.date}>
                  <time dateTime={entry.addedAt}>
                    {dateFmt.format(new Date(entry.addedAt))}
                  </time>
                  {entry.commit && (
                    <>
                      {" · "}
                      <a
                        className={styles.commit}
                        href={`${COMMIT_URL_BASE}${entry.commit}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {entry.commit.slice(0, 7)}
                      </a>
                    </>
                  )}
                </div>
                <h2 className={styles.entryTitle}>{entry.title}</h2>
                <p className={styles.description}>{entry.description}</p>
                {entry.credits.length > 0 && (
                  <p className={styles.credits}>
                    by {entry.credits.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </main>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
      <Footer />
    </>
  );
}
