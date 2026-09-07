import type { Metadata } from "next";
import localFont from "next/font/local";

import { ChatLauncher } from "@/components/chat-launcher";
import { HideOnAppSurfaces } from "@/components/chrome-slot";
import { LanguageProvider } from "@/components/language-provider";
import { LanguageSuggestion } from "@/components/language-suggestion";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import { dirFor } from "@/lib/i18n/config";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

/*
 * Fonts are served from our own origin rather than fetched from Google.
 * Two reasons, and the second is the real one: the build machine cannot always
 * reach fonts.gstatic.com, and neither can a user on a weak rural connection —
 * a page whose text is invisible until a third party responds is a page that
 * fails exactly the people this is built for.
 */
const inter = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "400 700",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

const sourceSerif = localFont({
  src: "./fonts/source-serif.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "600 700",
  fallback: ["Georgia", "serif"],
});

// Devanagari is loaded up front: the moment someone switches to Hindi or
// Marathi is the moment they are least able to wait for a font to arrive.
const notoDevanagari = localFont({
  src: "./fonts/noto-devanagari.woff2",
  variable: "--font-devanagari",
  display: "swap",
  weight: "400 600",
  fallback: ["Nirmala UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Avsarathi — find the schemes you are entitled to",
    template: "%s · Avsarathi",
  },
  description:
    "Avsarathi finds the government schemes you qualify for, explains what they " +
    "cost in rupees, and shows you where to go to apply. Built for SC, ST, OBC " +
    "and other marginalised households.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  // Urdu is right-to-left. Setting it here flips the whole layout —
  // padding, flex order, text alignment — because Tailwind's logical
  // properties follow the document direction.
  const dir = dirFor(lang);

  return (
    <html
      lang={lang}
      dir={dir}
      className={`${inter.variable} ${sourceSerif.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LanguageProvider lang={lang}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <HideOnAppSurfaces>
            <SiteFooter />
          </HideOnAppSurfaces>
          <ChatLauncher />
          <LanguageSuggestion />
          <Toaster position="top-center" />
        </LanguageProvider>
      </body>
    </html>
  );
}
