import { CheckForm } from "@/components/check-form";
import { getCatalogMeta } from "@/lib/api";

export const metadata = {
  title: "Check what you qualify for",
  description:
    "Answer a few optional questions and see every government scheme you are " +
    "likely to be entitled to, with the reason for each match.",
};

export default async function CheckPage() {
  const meta = await getCatalogMeta();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Let&apos;s find what you are entitled to
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Every question below is optional. Skipping one never hides a scheme
          from you — it only means we will tell you to check that condition
          yourself.
        </p>
      </header>

      <CheckForm meta={meta} className="mt-10" />
    </div>
  );
}
