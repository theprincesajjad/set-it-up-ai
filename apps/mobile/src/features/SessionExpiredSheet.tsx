import { router } from "expo-router";
import { t } from "../copy/en-CA";
import { useSession } from "../state/session";
import { Button, Sheet, Text } from "../ui";

/** Silent refresh failed → "Sign in again" → Phone step with the number pre-filled. */
export function SessionExpiredSheet() {
  const { expired, dismissExpired, prefs } = useSession();
  return (
    <Sheet
      visible={expired}
      onClose={dismissExpired}
      title="Sign in again"
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
          Sign in
        </Button>
      }
    >
      <Text color="fgMuted">{t("err.sessionExpired")}</Text>
    </Sheet>
  );
}
