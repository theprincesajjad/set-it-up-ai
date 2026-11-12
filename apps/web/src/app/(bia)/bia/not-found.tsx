import { ConsoleNotFound } from "@/components/errors";
import { getT } from "@/lib/i18n/server";

/** A page that is not here, inside the BIA console: the shell and its navigation stay; the way back is Home (/bia). */
export default async function NotFound() {
  const t = await getT();
  return <ConsoleNotFound home={{ href: "/bia", label: t("err.action.home") }} />;
}
