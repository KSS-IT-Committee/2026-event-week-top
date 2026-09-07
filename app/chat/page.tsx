import type { Metadata } from "next";

import { AuthGuard } from "@/app/components/AuthGuard";
import { Chat } from "@/app/components/Chat";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { INTERNAL_ROLES } from "@/lib/access";
import { listKnowledgeSources } from "@/lib/knowledge";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "AIチャット",
  description: "行事週間2026 の行事について質問できるAIチャットボット",
  isIndexable: false,
});

export default function ChatPage() {
  return (
    <AuthGuard role={INTERNAL_ROLES}>
      <Chat knowledgeSources={listKnowledgeSources()} />
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </AuthGuard>
  );
}
