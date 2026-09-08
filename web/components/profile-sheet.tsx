"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, ScanLine, Trash2 } from "lucide-react";

import { AadhaarScan, ScanResult } from "@/components/aadhaar-scan";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROFILE_FIELDS,
  clearProfile,
  profileFilled,
  readProfile,
  saveProfile,
  serverProfile,
  subscribeProfile,
  type Profile,
} from "@/lib/profile";
import type { StringKey } from "@/lib/i18n";

/**
 * "About you" — answered once, and then never asked again.
 *
 * The wizard already collected category, gender, state and income and threw
 * them away on navigation, so the assistant asked again and the application
 * pack could fill exactly one field. Everything the product knew about a
 * person lasted until they clicked a link.
 *
 * Three ways in, and each one catches what the one above drops:
 *
 *   scan the card  ->  three taps, nothing typed
 *   photograph it  ->  retriable and zoomable, for a worn card or a dim room
 *   type it        ->  works for someone with no card in reach
 *
 * Kept in `localStorage`, never on our server. A poor household's income and
 * community are not ours to hold, and clearing it here genuinely clears it.
 */

/** Read the store the way React wants it read, so edits in another tab land. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribeProfile, readProfile, serverProfile);
}

export function ProfileSheet({
  onDone,
  showHeading = true,
}: {
  onDone?: () => void;
  /** Off on its own page, where the page header already says this. */
  showHeading?: boolean;
}) {
  const { t } = useLanguage();
  const stored = useProfile();
  const [draft, setDraft] = useState<Profile>(stored);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<{ verified: boolean; last4: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const filled = profileFilled(draft);

  return (
    <div className="space-y-5">
      {showHeading ? (
        <header>
          <h2 className="font-display text-xl font-bold">{t("profile.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("profile.lede")}
          </p>
        </header>
      ) : null}

      {scanning ? (
        <AadhaarScan
          onClose={() => setScanning(false)}
          onFilled={(fromCard, verified, last4) => {
            // The card fills what it knows and leaves the rest alone — someone
            // who already typed their income should not lose it to a scan.
            setDraft((prev) => ({ ...prev, ...fromCard }));
            setScan({ verified, last4 });
            setScanning(false);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={() => setScanning(true)}
        >
          <ScanLine className="size-4" />
          {t("profile.scan")}
        </Button>
      )}

      {scan ? <ScanResult verified={scan.verified} last4={scan.last4} /> : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveProfile(draft);
          setSaved(true);
          onDone?.();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map(({ key, labelKey, type }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`profile-${key}`} className="text-sm">
                {t(labelKey as StringKey)}
              </Label>
              <Input
                id={`profile-${key}`}
                type={type ?? "text"}
                value={(draft[key] as string) ?? ""}
                inputMode={type === "number" ? "numeric" : undefined}
                onChange={(event) => {
                  setSaved(false);
                  setDraft((prev) => ({ ...prev, [key]: event.target.value }));
                }}
                className="h-11"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-11">
            {saved ? <Check className="size-4" /> : null}
            {saved ? t("profile.saved") : t("profile.save")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("profile.filled", { n: filled, total: PROFILE_FIELDS.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="ms-auto h-11 text-muted-foreground"
            onClick={() => {
              clearProfile();
              setDraft({});
              setScan(null);
              setSaved(false);
            }}
          >
            <Trash2 className="size-4" />
            {t("profile.clear")}
          </Button>
        </div>
      </form>

      <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        {t("profile.privacy")}
      </p>
    </div>
  );
}
