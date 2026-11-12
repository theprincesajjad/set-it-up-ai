import { router } from "expo-router";
import { useLocale } from "../lib/i18n";
import { useSession } from "../state/session";
import { FailView, Screen } from "../ui";

/** Any link or route the app does not have: say so, keep the shell, and give a way back (cards, the counter, or sign in). */
export default function NotFound() {
  const { t } = useLocale();
  const { status, mode } = useSession();
  const signedOut = status === "signedOut";
  const home = signedOut ? "/welcome" : mode === "counter" ? "/counter" : "/wallet";
  return (
    <Screen>
      <FailView
        title={t("mf.nf.title")}
        body={t("mf.nf.body")}
        primaryLabel={signedOut ? t("mf.go.signin") : t("mf.go.cards")}
        onPrimary={() => router.replace(home)}
        help={t("err.help.customer")}
      />
    </Screen>
  );
}
