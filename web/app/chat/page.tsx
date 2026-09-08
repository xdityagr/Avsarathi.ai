import { AssistantRail } from "@/components/assistant-rail";
import { ChatPanel } from "@/components/chat-panel";
import { getPlace, getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("chat.title"), description: t("chat.lede") };
}

export default async function ChatPage() {
  const place = await getPlace();

  // Fills the viewport below the header, so the composer sits at the bottom
  // edge of the screen. A chat that scrolls the page instead is unusable on a
  // phone, where the keyboard already takes half the screen.
  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
      <AssistantRail state={place} />
      {/* The rail carries the title on this page; repeating it in the
          conversation just pushes the starter questions down. */}
      <ChatPanel className="min-w-0 flex-1" showHeading={false} />
    </div>
  );
}
