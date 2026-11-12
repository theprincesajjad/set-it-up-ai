import { ConsoleNotFound } from "@/components/errors";
import { getT } from "@/lib/i18n/server";

/** A page that is not here, inside the rep console: the shell and its navigation stay; the way back is Home (/rep). */
export default async function NotFound() {
  const t = await getT();
  return <ConsoleNotFound home={{ href: "/rep", label: t("err.action.home") }} />;
}
