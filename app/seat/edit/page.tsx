import { Metadata } from "next";
import Link from "next/link";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { type Role } from "@/lib/access";

import styles from "./edit.module.css";
import RegisterPage from "./registerPage";
export const metadata: Metadata = {
  title: "Seat edit",
  description: "2026年度行事週間 芸能祭座席登録ページ",
};

type SeatEditPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

const EDIT_PAGES = [
  { id: "register", label: "指定して登録" },
  { id: "list", label: "リスト" },
] as const;

type EditPage = (typeof EDIT_PAGES)[number]["id"];

export default async function SeatEditPage({
  searchParams,
}: SeatEditPageProps) {
  const { page: rawPage } = await searchParams;
  const page: EditPage = EDIT_PAGES.some((item) => item.id === rawPage)
    ? (rawPage as EditPage)
    : "register";
  return (
    <AuthGuard role={["Geinousai", "IT"] as Role[]}>
      <div className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>芸能祭座席登録ページ</h1>
          <p className={styles.intro}>芸能祭委員会用の座席登録ページです。</p>
        </div>
        <div className={styles.switchButtons}>
          {EDIT_PAGES.map((item) => (
            <Link
              key={item.id}
              href={`/seat/edit?page=${item.id}`}
              className={`${styles.switchButton} ${
                page === item.id ? styles.active : styles.inactive
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className={styles.content}>
          {page === "register" && <RegisterPage />}
          {page === "list" && <ListPage />}
        </div>
      </div>
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

function ListPage() {
  return (
    <>
      <h1 className={styles.registerPageTitle}>まだ公開されていません</h1>
    </>
  );
}
