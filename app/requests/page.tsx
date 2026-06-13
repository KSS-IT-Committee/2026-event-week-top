import Image from "next/image";
import Link from "next/link";

import { FloatingMenu } from "@/app/components/FloatingMenu";

import styles from "./requests.module.css";

const MAINTAINERS = [
  "karencaya",
  "kinoto0103",
  "mochi-k18",
  "utsukushiioto0816-tech",
];

function MaintainerItem({ username }: { username: string }) {
  return (
    <li>
      <Link
        className={styles.maintainerLink}
        href={`https://github.com/${username}`}
      >
        <Image
          src={`https://github.com/${username}.png`}
          alt=""
          width={32}
          height={32}
          className={styles.avatar}
        />
        <span className={styles.maintainerName}>{username}</span>
      </Link>
    </li>
  );
}

export default function RequestPage() {
  return (
    <div className={styles.main}>
      <h1 className={styles.title}>新機能や修正をリクエストするには？</h1>
      <p className={styles.lead}>
        このサイトへの新機能の追加や修正を提案することができます。
        <br />
        方法は以下の3種類です。
      </p>
      <h2 className={styles.sectionTitle}>1. 委員に直接伝える</h2>
      <p className={styles.description}>
        委員に直接伝えていただければ、委員会で話し合いのうえ、機能の追加や修正を実装します。
      </p>
      <h2 className={styles.sectionTitle}>2. GitHubにてIssueを作成する</h2>
      <p className={styles.description}>
        <Link
          className={styles.link}
          href={"https://github.com/KSS-IT-Committee/2026-event-week-top"}
        >
          このページのリポジトリ
        </Link>
        にIssueを作成していただくと、話し合いの後、新機能や修正が実装されます。
      </p>
      <h2 className={styles.sectionTitle}>3. 委員会にメールを送る</h2>
      <p className={styles.description}>
        <Link
          className={styles.link}
          href={"mailto:koishikawa.itcommittee@gmail.com"}
        >
          委員会のメールアドレス
        </Link>
        宛にメールをお送りください。その際、どのページに関する提案か（このページであれば「行事週間トップページ」）を本文に記載してください。
      </p>

      <p className={styles.maintainersNote}>
        なお、このプロジェクトは以下の委員が管理しています。
      </p>
      <ul className={styles.maintainerList}>
        {MAINTAINERS.map((username) => (
          <MaintainerItem key={username} username={username} />
        ))}
      </ul>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </div>
  );
}
