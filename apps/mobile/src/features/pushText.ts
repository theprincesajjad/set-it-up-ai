import { isLocale, t as translate, type MessageKey } from "@ll/shared";
import { getJson } from "../state/storage";

/** A translator for text the OS shows outside the React tree (notification channel names): the language the person chose on this device. */
export async function savedTranslator(): Promise<(key: MessageKey) => string> {
  const saved = await getJson<string>("ll.locale.v1").catch(() => null);
  const locale = isLocale(saved) ? saved : "en";
  return (key) => translate(locale, key);
}
