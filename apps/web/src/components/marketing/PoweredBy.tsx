import type { Locale } from "@ll/shared";
import { PoweredBy } from "@/components/pass/PoweredBy";

/** The client-loop line as a client sees it, on a sample confirmation card (marketing pages only; the real line is components/pass/PoweredBy). */
export function PoweredByPreview({ locale, vertical }: { locale: Locale; vertical: string }) {
  return (
    <div aria-hidden inert data-theme="light" className="rounded-sheet bg-card p-6 text-foreground shadow-card">
      <p className="text-meta-strong text-muted-foreground">Sample confirmation</p>
      <p className="display mt-2 text-title">you&apos;re booked, Priya.</p>
      <p className="mt-1 text-body text-muted-foreground">Gel fill · Sat 11:30 am</p>
      <div className="mt-4 rounded-card bg-bg-subtle px-4 py-3">
        <PoweredBy locale={locale} vertical={vertical} source="preview" />
      </div>
    </div>
  );
}
