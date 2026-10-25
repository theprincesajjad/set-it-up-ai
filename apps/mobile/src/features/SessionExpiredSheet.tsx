import { router } from "expo-router";
import { useLocale } from "../lib/i18n";
import { useSession } from "../state/session";
import { Button, Sheet, Text } from "../ui";

/** Silent refresh failed → "Sign in again" → Phone step with the number pre-filled. */
export function SessionExpiredSheet() {
  const { expired, dismissExpired, prefs } = useSession();
  const { t } = useLocale();
  return (
    <Sheet
      visible={expired}
      onClose={dismissExpired}
      title={t("ms.session.title")}
      scroll={false}
      footer={
        <Button
          fullWidth
          onPress={() => {
            dismissExpired();
            if (prefs.mode === "counter") router.replace("/staff-sign-in");
            else router.replace({ pathname: "/phone", params: { prefill: prefs.lastPhone ?? "" } });
          }}
        >
          {t("rc.signIn")}
        </Button>
      }
    >
      <Text color="fgMuted">{t("cp.err.sessionExpired")}</Text>
    </Sheet>
  );
}
