import { CheckForm } from "@/components/check-form";
import { getCatalogMeta, getScheme } from "@/lib/api";
import { getPlace, getT } from "@/lib/i18n/server";

export const metadata = {
  title: "Check what you qualify for",
  description:
    "Answer a few optional questions and see every government scheme you are " +
    "likely to be entitled to, with the reason for each match.",
};

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const wanted = Array.isArray(params.scheme) ? params.scheme[0] : params.scheme;
  const [meta, t, place, focus] = await Promise.all([
    getCatalogMeta(), getT(), getPlace(),
    wanted ? getScheme(wanted) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        {/* Arriving from one scheme's page is a different question from
            "what am I entitled to" — it is "do I qualify for THIS", and the
            page should say so rather than silently widening the ask. */}
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {focus ? t("check.h1.scheme") : t("check.h1")}
        </h1>
        {focus ? (
          <p className="mt-3 text-lg font-medium text-primary">
            {focus.name.trim()}
          </p>
        ) : null}
        <p className="mt-3 text-lg text-muted-foreground">
          {focus ? t("check.lede.scheme") : t("check.lede")}
        </p>
      </header>

      <CheckForm
        meta={meta}
        initialState={place}
        focusSlug={focus?.slug ?? null}
        className="mt-10"
      />
    </div>
  );
}
