import { CreditForm } from "@/components/credit-form";

export const metadata = {
  title: "NSFDC loans",
  description:
    "Work out which NSFDC credit scheme fits, what it costs in rupees against " +
    "a moneylender, and which office near you can actually disburse it.",
};

export default function CreditPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          What the loan actually costs
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          NSFDC runs five credit schemes for Scheduled Caste households, at rates
          from 6% to 15%. They are not interchangeable, and picking the wrong one
          can cost tens of thousands of rupees on the same project. This works out
          which ones you qualify for and what each would take from you.
        </p>
      </header>

      <CreditForm className="mt-10" />
    </div>
  );
}
