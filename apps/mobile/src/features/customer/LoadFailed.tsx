import { useLocale } from "../../lib/i18n";
import { CircleAlert, CloudOff, EmptyState } from "../../ui";
import { failCopy } from "./failCopy";

/**
 * A list or section whose request failed: says what happened (offline, or our side), keeps the person's data out of the
 * picture, and offers Try again. Never an empty state ("Nothing here yet"), which would read as real, empty data.
 */
export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const L = useLocale();
  const f = failCopy(L, error);
  return <EmptyState icon={f.offline ? CloudOff : CircleAlert} title={f.title} body={f.body} actionLabel={L.t("err.action.retry")} onAction={onRetry} />;
}
