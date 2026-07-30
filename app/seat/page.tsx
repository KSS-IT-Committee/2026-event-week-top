import { Metadata } from "next";

import { FloatingMenu } from "../components/FloatingMenu";
import styles from "./seat.module.css";

export const metadata: Metadata = {
  title: "Seat List",
  description: "2026年度行事週間 芸能祭座席一覧ページ",
};

export default function SeatPage() {
  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>芸能祭座席一覧</h1>
        <p className={styles.intro}>最新の座席情報をご案内します。</p>
      </div>
      <FloatingMenu
        items={[
          {
            label: "Top",
            href: "/",
          },
        ]}
      />
    </div>
  );
}
