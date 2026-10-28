import type { ReactNode } from "react";
import type { Locale } from "@ll/shared";
import { PassTopBar } from "@/components/pass/PassChrome";
import { Awning } from "@/components/ui/Awning";
import { LocaleScope } from "@/lib/i18n";

/** Nastaliq has tall ascenders: give running text, labels and headings extra leading (the type scale sets tighter line heights). */
export const URDU_LEADING = " [&_p]:!leading-[2.1] [&_dt]:!leading-[2.1] [&_dd]:!leading-[2.1] [&_label]:!leading-[2.1] [&_summary]:!leading-[2.1] [&_h1]:!leading-[2] [&_h2]:!leading-[2] [&_h3]:!leading-[2]";

/** Locale scope + the pass top bar (language chip, optional back and title) shared by every customer page. `lang` / `dir` come from LocaleScope. */
export function PageFrame({ locale, children, className, title, backHref, trade }: { locale: Locale; children: ReactNode; className?: string; title?: ReactNode; backHref?: string; /** The shop's vertical: the page wears that trade's accent family (`data-trade`). */ trade?: string }) {
  return (
    <LocaleScope locale={locale} trade={trade} className={`${className ?? "flex flex-col gap-6 pt-2 pb-10"} [&_h1]:text-trade-deep clear:[&_h1]:text-foreground${locale === "ur" ? URDU_LEADING : ""}`}>
      {trade ? <Awning size="sm" className="-mt-2 rounded-b-md rounded-t-none clear:hidden" /> : null}
      <PassTopBar title={title} backHref={backHref} className="self-stretch" />
      {children}
    </LocaleScope>
  );
}
