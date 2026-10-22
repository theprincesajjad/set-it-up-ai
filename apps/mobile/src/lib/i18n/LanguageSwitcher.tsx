import { LOCALE_LIST } from "@ll/shared";
import { SegmentedControl } from "../../ui";
import { useLocale } from "./index";

/** Pill segmented control with each language in its own script. Drop it at the top of a screen or in settings. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <SegmentedControl accessibilityLabel={t("lang.label")} value={locale} onChange={setLocale} options={LOCALE_LIST.map((l) => ({ value: l.code, label: l.name }))} />;
}
