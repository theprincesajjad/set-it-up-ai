"use client";
/**
 * Customer pass chrome (v3 frame 15:184): the awning stripe on a pass card, the language chip, and the top bar every
 * pass page opens with. The awning takes the shop's trade colour from `[data-trade]`.
 */
import { ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LOCALE_LIST } from "@ll/shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/primitives/dropdown-menu";
import { Awning } from "@/components/ui/Awning";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** The top edge of a pass card: the shared awning stripe (terracotta and white, or `tone="trade"` in the shop's accent from `[data-trade]`), clipped by the card's rounded corners. One per page. */
export function AwningStripe({ className, tone = "primary" }: { className?: string; tone?: "primary" | "trade" }) {
  return <Awning tone={tone} size="md" className={cn("rounded-none", className)} />;
}

/**
 * Language switcher for every pass page: a globe and the language's short code ("EN"). Opens a menu of the four languages,
 * each named in its own script. Saves the choice the same way the old pill switcher did (cookie + ?lang=).
 */
export function LanguageChip({ className }: { className?: string }) {
  const { locale, setLocale, t, info } = useLocaleOrEnglish();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("lang.label")}: ${info.short}`}
        className={cn(
          "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-meta-strong text-foreground transition-colors duration-150 ease-out hover:bg-hover focus-visible:focus-ring data-popup-open:bg-hover",
          // Clear: a small glass button (it often sits on the pass's brand field or over the map).
          "clear:border-0 clear:glass-lite",
          // 44 px hit area around the 36 px pill.
          "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
          className,
        )}
      >
        <Globe aria-hidden className="size-4" strokeWidth={1.75} />
        <span dir="auto" lang={info.code}>{info.short}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 min-w-44 p-1.5">
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as typeof locale)} aria-label={t("lang.label")}>
          {LOCALE_LIST.map((l) => (
            <DropdownMenuRadioItem key={l.code} value={l.code} lang={l.code} dir={l.dir} className="min-h-11 text-body">
              {l.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Top bar of a pass page: back (optional), title (optional, centred), language chip at the end. Pages that carry their own
 * heading pass no title and get just the chip. Layout is logical, so it mirrors in Urdu.
 */
export function PassTopBar({ title, backHref, backLabel, className, children }: { title?: ReactNode; backHref?: string; backLabel?: string; className?: string; children?: ReactNode }) {
  const { t } = useLocaleOrEnglish();
  return (
    <div className={cn("flex min-h-11 items-center gap-2", className)}>
      {backHref ? (
        <Link href={backHref} aria-label={backLabel ?? t("pass.nav.back")} className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-hover focus-visible:focus-ring">
          <ArrowLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
        </Link>
      ) : (
        title ? <span aria-hidden className="size-11 shrink-0" /> : null
      )}
      <div className="min-w-0 flex-1 text-center font-display text-headline font-bold text-foreground">{title}</div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <LanguageChip />
      </div>
    </div>
  );
}

/**
 * A pass section card ("Nearby on your street", "Rewards", "Recent visits"): a white card with a soft shadow on the cream canvas, its Fraunces title with its title in a header row
 * and hairline-divided rows below. `children` are usually `<li>`s; rows bring their own vertical padding.
 * Clear (v6 mock `?s=pass`): the title is a Wallet caps label (11/16) above a flat r20 card; the hairlines are overlaid (no layout height).
 */
export function PassPanel({ title, action, children, className, as = "ul", id }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; as?: "ul" | "div"; id?: string }) {
  const As = as;
  return (
    <section
      aria-label={typeof title === "string" ? title : undefined}
      id={id}
      className={cn("overflow-hidden rounded-card border border-line bg-card shadow-card", "clear:overflow-visible clear:rounded-none clear:border-0 clear:bg-transparent clear:shadow-none", className)}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3.5 clear:min-h-0 clear:border-0 clear:pt-0 clear:pb-2">
        <h2 className="font-display text-[20px] font-bold leading-7 text-foreground clear:text-[11px] clear:font-semibold clear:uppercase clear:leading-4 clear:tracking-[0.04em] clear:text-muted-foreground">{title}</h2>
        {action}
      </div>
      <As className="flex flex-col divide-y divide-line px-4 clear:card-clear clear:divide-y-0 clear:divide-overlay clear:overflow-hidden clear:rounded-r6">{children}</As>
    </section>
  );
}
