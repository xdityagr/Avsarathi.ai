import { ChatPanel } from "@/components/chat-panel";

export const metadata = {
  title: "Ask Avsarathi",
  description:
    "Ask about government loan schemes in Hindi, Marathi, Bengali, Tamil or " +
    "English, and get the real cost and the nearest office that can pay out.",
};

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 sm:px-6">
      <header className="border-b border-border py-6">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Ask Avsarathi
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Answer in whichever language you are comfortable with — it follows you
          without being asked. Every figure comes from the calculator, not from a
          model, so the numbers are the same ones the office will quote.
        </p>
      </header>

      <ChatPanel className="min-h-0 flex-1" />
    </div>
  );
}
