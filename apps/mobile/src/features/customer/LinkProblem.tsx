import { router } from "expo-router";
import { useLocale } from "../../lib/i18n";
import { canRetry, failKind } from "../../lib/failKind";
import { CloudOff, FailView, Screen } from "../../ui";

/**
 * A screen opened from a link (quote, order, ticket, catering) that could not load. Says the true thing:
 * offline and server errors offer Try again and say nothing is lost; a missing or expired link says so and
 * points to the shop, because retrying cannot help. Always a way back to the wallet.
 */
export function LinkProblem({ error, onRetry, missingTitle }: { error: unknown; onRetry?: () => void; /** What was not found, for example "We couldn’t find this order." */ missingTitle?: string }) {
  const { t } = useLocale();
  const kind = failKind(error);
  const toCards = () => router.replace("/wallet");
  const retry = onRetry && canRetry(kind) ? { primaryLabel: t("err.action.retry"), onPrimary: onRetry } : {};
  const help = t("err.help.customer");

  let view;
  if (kind === "offline") {
    view = <FailView icon={CloudOff} title={t("err.offline.title")} body={t("err.offline.body")} {...retry} secondaryLabel={t("err.action.myCard")} onSecondary={toCards} />;
  } else if (kind === "server" || kind === "other") {
    view = <FailView title={t("err.server.title")} body={t("err.server.body")} {...retry} secondaryLabel={t("err.action.myCard")} onSecondary={toCards} />;
  } else if (kind === "signedOut") {
    view = <FailView title={t("err.session.title")} body={t("err.session.body")} primaryLabel={t("err.session.action")} onPrimary={() => router.replace("/welcome")} secondaryLabel={t("err.action.myCard")} onSecondary={toCards} />;
  } else if (kind === "forbidden") {
    view = <FailView title={t("err.forbidden.title")} body={t("err.forbidden.body.customer")} primaryLabel={t("err.forbidden.action")} onPrimary={() => router.replace("/welcome")} secondaryLabel={t("err.action.myCard")} onSecondary={toCards} help={help} />;
  } else if (kind === "expired") {
    view = <FailView title={t("mf.link.expired.title")} body={t("mf.link.expired.body")} primaryLabel={t("err.action.myCard")} onPrimary={toCards} help={help} />;
  } else {
    view = <FailView title={missingTitle ?? t("mf.link.bad.title")} body={t("mf.link.bad.body")} primaryLabel={t("err.action.myCard")} onPrimary={toCards} help={help} />;
  }
  return <Screen back>{view}</Screen>;
}
