"use client";
import { LOCALE_LIST } from "@ll/shared";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { useLocale } from "./client";

/** Pill segmented control (English / हिन्दी / اردو / ਪੰਜਾਬੀ). Each option is labelled in its own script with its own `lang`. */
export function LanguageSwitcher({ className, size }: { className?: string; /** "lg" gives 44px targets (the signup flow, on a phone). */ size?: "sm" | "md" | "lg" }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <SegmentedControl
      label={t("lang.label")}
      value={locale}
      onChange={setLocale}
      className={cn("max-w-full", className)}
      size={size}
      options={LOCALE_LIST.map((l) => ({ value: l.code, label: l.name }))}
    />
  );
}
