import { LOCALES, isLocale } from "@ll/shared";
import { Dot, type DotTone } from "@/components/dashboard";

export const languageName = (code: string | null) => (code && isLocale(code) ? LOCALES[code].englishName : (code ?? "Not detected"));

const STATUS: Record<string, [DotTone, string]> = {
  received: ["neutral", "Received"],
  drafted: ["info", "Needs a look"],
  confirmed: ["positive", "Became an order"],
  failed: ["negative", "Couldn't place"],
  discarded: ["neutral", "Discarded"],
};

export function CallStatus({ status }: { status: string }) {
  const [tone, label] = STATUS[status] ?? ["neutral", status];
  return <Dot tone={tone}>{label}</Dot>;
}
