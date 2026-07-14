import Image from "next/image";

import styles from "../lottery.module.css";

// 観覧人数の数え方 pictograms, reused from the 2025 sousakuten site
// (2025-sousakutenhp/public/img/lottery/people) — same counting policy.
const PEOPLE_EXAMPLES = [
  { file: "a1", alt: "大人1人の場合は1人で申し込みしてください。" },
  { file: "pp", alt: "大人2人の場合は2人で申し込みしてください。" },
  { file: "e1", alt: "小学生1人の場合は申し込みできません。" },
  { file: "e2", alt: "小学生2人の場合は申し込みできません。" },
  {
    file: "pm",
    alt: "大人1人と未就学児1人の場合は1人で申し込みしてください。",
    height: 783,
  },
  { file: "pe", alt: "大人1人と小学生1人の場合は2人で申し込みしてください。" },
  {
    file: "pmp",
    alt: "大人2人と未就学児1人の場合は2人で申し込みしてください。",
  },
  { file: "pep", alt: "大人2人と小学生1人の場合は申し込みできません。" },
] as const;

/**
 * 観覧人数の数え方 — who counts toward the 1〜2名 limit. Rendered only where
 * the 人数 selector exists (parent entries); 本人 entries are always one
 * person, so the rules are irrelevant there.
 */
export function PartySizeGuide() {
  return (
    <section className={styles.peopleGuide} aria-label="観覧人数の数え方">
      <h2 className={styles.peopleGuideTitle}>観覧人数の数え方</h2>
      <ul className={styles.notesList}>
        <li>1名または2名で申し込めます。</li>
        <li>
          未就学児は人数にカウントしません。小学生以上は人数にカウントします。
        </li>
        <li>
          小学生以下は大人（高校生を除く18歳以上）の同伴が必要です。小学生は必ず大人1人と一緒に「2名」で申し込んでください。
        </li>
        <li>
          「2名」は大人と小学生のペアに限らず、中学生以上のペアでも選べます。
        </li>
      </ul>
      <div className={styles.peopleGrid}>
        {PEOPLE_EXAMPLES.map((example) => (
          <Image
            key={example.file}
            className={styles.peopleImage}
            src={`/img/lottery/people/${example.file}.png`}
            alt={example.alt}
            width={2667}
            height={"height" in example ? example.height : 782}
            sizes="(max-width: 640px) 100vw, 330px"
          />
        ))}
      </div>
    </section>
  );
}
