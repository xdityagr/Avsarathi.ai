import { CheckForm } from "@/components/check-form";
import { getCatalogMeta } from "@/lib/api";
import { getPlace, getT } from "@/lib/i18n/server";

export const metadata = {
  title: "Check what you qualify for",
  description:
    "Answer a few optional questions and see every government scheme you are " +
    "likely to be entitled to, with the reason for each match.",
};

export default async function CheckPage() {
  const [meta, t, place] = await Promise.all([
    getCatalogMeta(), getT(), getPlace(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {t("check.h1")}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {t("check.lede")}
        </p>
      </header>

      <CheckForm meta={meta} initialState={place} className="mt-10" />
    </div>
  );
}
