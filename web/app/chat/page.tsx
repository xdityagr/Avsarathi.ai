import { ChatPanel } from "@/components/chat-panel";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("chat.title"), description: t("chat.lede") };
}

export default function ChatPage() {
  // Fills the viewport minus the header so the composer sits at the bottom of
  // the screen on a phone, where a page-scrolled composer is unusable.
  return <ChatPanel className="h-[calc(100dvh-4rem)]" />;
}
