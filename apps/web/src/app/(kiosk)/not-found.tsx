import { AccessDenied } from "@/components/errors/server";
import { getT } from "@/lib/i18n/server";

/** The door tablet link is for a shop this account does not belong to (or no longer exists): say so and offer the right way on. */
export default async function KioskNotFound() {
  const t = await getT();
  return <AccessDenied title={t("err.door.title")} description={t("err.door.body")} goHref="/m" goLabel={t("err.action.counter")} />;
}
