import type { Metadata } from "next";
import Link from "next/link";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import { PartySizeGuide } from "@/app/lottery/[lotteryId]/PartySizeGuide";

import {
  APPLICATION_PERIOD,
  EXTERNAL_FORM_URL,
  NOTICES,
  RESULT_ANNOUNCEMENT,
  RESULT_PAGE_URL,
} from "@/app/lottery-external/formConfig";
import styles from "@/app/lottery-external/lottery-external.module.css";

/**
 * 外部の方向けの観覧抽選 案内ページ。
 *
 * ログイン不要の静的ページで、申込そのものは外部フォーム
 * （EXTERNAL_FORM_URL）に任せます。校内向けの申込ページ（/lottery）とは
 * 別系統で、DBにも触れません。差し替えたい値は formConfig.ts にあります。
 */

export const metadata: Metadata = {
  title: "公演観覧抽選（外部の方向け） | 行事週間2026",
  description:
    "創作展 創作部門（5・6年生）クラス劇の観覧抽選について、外部の方向けの申し込み方法のご案内です。",
};

// 創作部門の公演時間。lib/lotteries.ts の SOUSAKU_PERFORMANCE_TIMES と
// 同じ内容を表示用に持っています（あちらは server/DB 側の定義なので、
// 変更したときは両方を揃えてください）。
const PERFORMANCE_SLOTS = [
  { label: "第一公演", time: "8:45～10:00" },
  { label: "第二公演", time: "10:20～11:35" },
  { label: "第三公演", time: "12:30～13:45" },
  { label: "第四公演", time: "14:05～15:20" },
] as const;

export default function LotteryExternalPage() {
  return (
    <>
      <div className={styles.main}>
        <article className={styles.card}>
          <h1 className={styles.title}>公演観覧抽選（外部の方向け）</h1>
          <p className={styles.lead}>
            創作展のうち、創作部門（5・6年生）のクラス劇の観覧のみ、事前抽選を行います。
            観覧を希望される外部の方は、以下の方法でお申し込みください。
            なお、1〜4年生の展示・公演や部活動等の展示・公演については抽選を行いませんので、
            当日そのままお越しください。
          </p>

          {NOTICES.length > 0 && (
            <section className={styles.section} aria-labelledby="notices">
              <h2 className={styles.sectionTitle} id="notices">
                お知らせ
              </h2>
              <ul className={styles.noticeList}>
                {NOTICES.map((notice) => (
                  <li key={notice.date + notice.body}>
                    <span className={styles.noticeDate}>（{notice.date}）</span>
                    {notice.body}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section} aria-labelledby="caution">
            <h2 className={styles.sectionTitle} id="caution">
              注意事項
            </h2>
            <ul className={styles.list}>
              <li className={styles.important}>
                当選された方は、必ず公演開始5分前までに当選クラスの受付へお越しください。
                5分前の時点で不在の場合、当選は無効となります。
              </li>
              <li>
                抽選の結果、定員に満たなかった分はキャンセル待ちの列から補填されます。
                抽選に外れたがどうしても観たい公演がある場合は、お早めにキャンセル待ち列へお並びください。
              </li>
              <li>
                同じ観覧枠を第一希望〜第三希望で重複して選んだ場合は無効となります。
              </li>
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="how-to-apply">
            <h2 className={styles.sectionTitle} id="how-to-apply">
              抽選の申し込み方法
            </h2>

            <h3 className={styles.subTitle}>▶ 生徒・教職員の方</h3>
            <p className={styles.text}>
              校内でお知らせしている方法（
              <Link
                className={`${styles.inlineLink} ${styles.internalLink}`}
                href="/lottery"
              >
                校内向け申込ページ
              </Link>
              ）からお申し込みください。このページのフォームは外部の方向けです。
            </p>

            <h3 className={styles.subTitle}>▶ 保護者の方</h3>
            <p className={styles.text}>
              お子様のアカウントでログインして、
              <Link
                className={styles.inlineLink}
                href="/lottery"
                style={{ color: "red" }}
              >
                校内向け申込ページ
              </Link>
              からお申し込みください。お子様が所属するクラスの劇は優先して観覧できます。
              詳しくは学校からの連絡をご確認ください。
            </p>

            <h3 className={styles.subTitle}>▶ 外部の方</h3>
            <p className={styles.text}>
              申し込みフォームから観覧申し込みを行ってください。 受付期間は
              <strong>{APPLICATION_PERIOD ?? "後日お知らせします"}</strong>
              です。
            </p>
            {EXTERNAL_FORM_URL === null ? (
              <p className={styles.pending}>
                申し込みフォームは準備中です。公開まで今しばらくお待ちください。
              </p>
            ) : (
              <a
                className={styles.formLink}
                href={EXTERNAL_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                申し込みフォームへ
              </a>
            )}
          </section>

          <section className={styles.section} aria-labelledby="slots">
            <h2 className={styles.sectionTitle} id="slots">
              観覧枠
            </h2>
            <p className={styles.text}>
              9月12日（土）・13日（日）の各日に、以下の4公演があります。
              クラスと時間をセットで、第一希望から第三希望まで選択できます。
            </p>
            <ul className={styles.list}>
              {PERFORMANCE_SLOTS.map((slot) => (
                <li key={slot.label}>
                  {slot.label}　{slot.time}
                </li>
              ))}
            </ul>
            <p className={styles.text}>
              6年生の劇は例年応募が集中し、倍率が高くなる傾向があります。
              5年生の劇も併せてご希望いただくことで、当選の可能性が高まります。
            </p>
          </section>

          <PartySizeGuide />

          <section className={styles.section} aria-labelledby="result">
            <h2 className={styles.sectionTitle} id="result">
              当選発表
            </h2>
            <p className={styles.text}>
              受付期間終了後に抽選を行い、
              {RESULT_ANNOUNCEMENT ?? "受付期間終了後"}
              に当選を発表する予定です。
              申し込み完了時に表示される受付番号・抽選番号は、当日の受付や当落の確認に必要ですので、必ず控えておいてください。
            </p>
            {RESULT_PAGE_URL !== null && (
              <p className={styles.text}>
                当選者は
                <a
                  className={styles.inlineLink}
                  href={RESULT_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  こちら
                </a>
                から確認できます。
              </p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="on-the-day">
            <h2 className={styles.sectionTitle} id="on-the-day">
              当日について
            </h2>
            <ul className={styles.list}>
              <li>
                当日は受付番号で本人確認を行いますので、受付番号のメモをご持参ください。
              </li>
              <li>公演開始5分前までに当選クラスの受付へお越しください。</li>
            </ul>
          </section>
        </article>
      </div>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </>
  );
}
