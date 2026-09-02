import { Metadata } from "next";

import { getSeatsByUsername } from "@/db/getSeatByUsername";
import { performanceEnum } from "@/db/schema";
import { INTERNAL_ROLES, type Role } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";

import { AuthGuard } from "../components/AuthGuard";
import { FloatingMenu } from "../components/FloatingMenu";
import { Internal } from "../components/Internal";
import styles from "./seat.module.css";

export const metadata: Metadata = {
  title: "Seat List",
  description: "2026年度行事週間 芸能祭座席一覧ページ",
};

export default async function SeatPage() {
  const user = await getCurrentUser();
  const seats = user ? await getSeatsByUsername(user.username) : [];
  const seatNumbers = performanceEnum.enumValues.map(
    (performance) =>
      seats.find((seat) => seat.performance === performance)?.seat ?? null,
  );

  return (
    <AuthGuard role={INTERNAL_ROLES}>
      <div className={styles.header}>
        <h1 className={styles.title}>芸能祭座席一覧</h1>
        <p className={styles.intro}>最新の座席情報をご案内します。</p>
      </div>
      <Internal role={["Geinousai", "IT"] as Role[]}>
        <div className={styles.adminpanel}>
          <h2 className={styles.adminpanelTitle}>
            芸能祭委員会用：チケット登録ページ
          </h2>
          <a className={styles.editSite} href="/seat/edit">
            <p
              style={{
                color: "#fff",
                WebkitTextFillColor: "#fff",
                opacity: 1,
              }}
            >
              芸能祭座席登録サイト
            </p>
          </a>
        </div>
      </Internal>
      <h2 className={styles.username}>{user?.username}の芸能祭チケット</h2>
      <ul className={styles.seatList}>
        {performanceEnum.enumValues.map((performance, index) => (
          <li key={performance} className={styles.seatItem}>
            <span>{performance}公演</span>
            <span>{seatNumbers[index] ?? "—"}</span>
          </li>
        ))}
      </ul>
      <FloatingMenu
        items={[
          {
            label: "Top",
            href: "/",
          },
        ]}
      />
    </AuthGuard>
  );
}
