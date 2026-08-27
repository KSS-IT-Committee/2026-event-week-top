import { Metadata } from "next";

import { type Role } from "@/lib/access";

import { FloatingMenu } from "../components/FloatingMenu";
import { Internal } from "../components/Internal";
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
      <Internal role={["Geinousai", "IT"] as Role[]}>
        <div className={styles.adminpanel}>
          <h2 className={styles.adminpanelTitle}>
            芸能祭委員会用：チケット登録ページ
          </h2>
        </div>
      </Internal>
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
