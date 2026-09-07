import { Metadata } from "next";
import Link from "next/link";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { SEAT_ADMIN_ROLES } from "@/lib/seat-access";
import { pageMetadata } from "@/lib/site";

import styles from "./edit.module.css";
import { RegisterPage } from "./RegisterPage";
export const metadata: Metadata = pageMetadata({
  title: "芸能祭 座席登録",
  description: "行事週間2026 芸能祭の座席登録ページ",
  isIndexable: false,
});

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
    <AuthGuard role={SEAT_ADMIN_ROLES}>
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
      {page === "register" && <RegisterPage />}
      {page === "list" && <ListPage />}
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
