"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { Button } from "@/components/ui/button";

/**
 * The assistant, reachable from every page without being the whole product.
 *
 * It is a launcher rather than a takeover because the chat is one way in, not
 * the only one: the browse and check flows exist for people who would rather
 * read and tap than type, which on a small keyboard in a second language is
 * most people.
 */
export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The dedicated chat page already is the chat.
  if (pathname === "/chat") return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 gap-2 rounded-full px-5 shadow-lg"
        aria-label="Ask Avsarathi"
      >
        <MessageCircle className="size-4" />
        <span className="hidden sm:inline">Ask</span>
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-foreground/20"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ask Avsarathi"
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-paper shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-display text-base font-bold">Ask Avsarathi</h2>
                <p className="text-xs text-muted-foreground">
                  Loans, in your language
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </Button>
            </header>
            <ChatPanel className="min-h-0 flex-1" />
          </div>
        </div>
      ) : null}
    </>
  );
}
