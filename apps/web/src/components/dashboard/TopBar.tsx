"use client";
/**
 * The pieces of the 56 px top bar (v3-strategy.md 4.1): location, search (Ctrl K), language, help, alerts. The account menu is
 * in AccountMenu.tsx. No page actions live here; those belong to the page header.
 */
import { Bell, ChevronDown, Globe, MapPin, Search, CircleHelp } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LOCALE_LIST, type Locale } from "@ll/shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/primitives/dropdown-menu";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useNeedsYouCount } from "@/lib/dashboard/needsYou";
import { cn } from "@/lib/utils";

/** 44 px square, round: the shared look of the icon buttons in the bar. */
export const topIconButton = "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:focus-ring aria-expanded:bg-muted";

/** Where the shop is. One location: its street. Several: how many, linking to Locations. Not a filter: no page filters by it. */
export function LocationChip({ label, href }: { label: string; href?: string }) {
  const cls = "inline-flex h-11 max-w-55 items-center gap-1.5 rounded-lg px-2 text-body font-medium text-foreground";
  const inner = (
    <>
      <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <bdi className="truncate">{label}</bdi>
    </>
  );
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted focus-visible:focus-ring")}>
      {inner}
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

const subscribeNoop = () => () => undefined;
/** "Ctrl K" on Windows and Linux, the command key on a Mac. */
function useShortcut() {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** The wide search field in the bar; opens the command menu. */
export function SearchField({ onOpen, placeholder }: { onOpen: () => void; placeholder: string }) {
  const key = useShortcut();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-11 min-w-0 max-w-95 flex-1 items-center gap-2 rounded-lg bg-muted px-3 text-start text-body text-muted-foreground transition-colors hover:bg-hover focus-visible:focus-ring"
    >
      <Search aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      <kbd dir="ltr" className="shrink-0 rounded-sm border border-border px-1.5 text-caption text-muted-foreground">
        {key}
      </kbd>
    </button>
  );
}

/** The phone's search icon. */
export function SearchIconButton({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onOpen} className={topIconButton}>
      <Search aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}

/** Language: the four UI languages, each named in its own script. Sets the cookie and the page language. */
export function LanguageMenu() {
  const { locale, setLocale, t, dir } = useLocaleOrEnglish();
  const current = LOCALE_LIST.find((l) => l.code === locale)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-body font-medium text-foreground hover:bg-muted focus-visible:focus-ring aria-expanded:bg-muted"
      >
        <Globe aria-hidden className="size-4" strokeWidth={1.75} />
        <span lang={current.bcp47}>{current.short}</span>
        <span className="sr-only">{`${t("lang.label")}: ${current.englishName}`}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" dir={dir} className="w-44">
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          {LOCALE_LIST.map((l) => (
            <DropdownMenuRadioItem key={l.code} value={l.code} lang={l.bcp47} dir={l.dir} className="min-h-11 text-body md:min-h-9">
              {l.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HelpLink({ label }: { label: string }) {
  return (
    <a href="mailto:help@localloyalty.example" aria-label={label} title={label} className={topIconButton}>
      <CircleHelp aria-hidden className="size-5" strokeWidth={1.75} />
    </a>
  );
}

/** The bell goes to what needs the shop (Needs you on Today). A dot shows only when Today has counted at least one thing. */
export function AlertsLink({ href, label }: { href: string; label: string }) {
  const n = useNeedsYouCount();
  return (
    <Link href={href} aria-label={label} title={label} className={topIconButton}>
      <Bell aria-hidden className="size-5" strokeWidth={1.75} />
      {n && n > 0 ? <span aria-hidden className="absolute end-2.5 top-2.5 size-2 rounded-full bg-points" /> : null}
    </Link>
  );
}

