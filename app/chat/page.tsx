import type { Metadata } from "next";

import { AuthGuard } from "@/app/components/AuthGuard";
import { Chat } from "@/app/components/Chat";
import { FloatingMenu } from "@/app/components/FloatingMenu";

export const metadata: Metadata = {
  title: "AIチャット | 行事週間2026",
  description: "行事週間2026 の行事について質問できるAIチャットボット",
};

export default function ChatPage() {
  return (
    <AuthGuard>
      <Chat />
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </AuthGuard>
  );
}
