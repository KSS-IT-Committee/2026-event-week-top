import Image from "next/image";
import Link from "next/link";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import { Internal } from "@/app/components/Internal";
import { INTERNAL_ROLES } from "@/lib/access";

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
      </p>
      <Internal role={INTERNAL_ROLES}>
        <h2 className={styles.sectionTitle}>委員に直接伝える</h2>
        <p className={styles.description}>
          IT委員に直接お伝えください。内容を委員会で検討し、必要に応じて新機能の追加や修正を行います。
        </p>
      </Internal>
      <h2 className={styles.sectionTitle}>GitHub上でIssueを作成する</h2>
      <p className={styles.description}>
        <Link
          className={styles.link}
          href={
            "https://github.com/KSS-IT-Committee/2026-event-week-top/issues/new"
          }
        >
          このページのリポジトリ
        </Link>
        にIssueを作成してください。内容を委員会で検討し、必要に応じて新機能の追加や修正を行います。
      </p>
      <h2 className={styles.sectionTitle}>委員会にメールを送る</h2>
      <p className={styles.description}>
        <Link
          className={styles.link}
          href={"mailto:koishikawa.itcommittee@gmail.com"}
        >
          委員会のメールアドレス(koishikawa.itcommittee@gmail.com)
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
