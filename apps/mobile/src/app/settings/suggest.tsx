import { BRAND } from "@ll/shared";
import { SUPPORT_EMAIL } from "../../config";
import { useState } from "react";
import { Linking } from "react-native";
import { useLocale } from "../../lib/i18n";
import { Button, Screen, Text, TextField } from "../../ui";

/** "Suggest my street" (empty.noNeighbourhood). Sent by email until there's an API for it. */
export default function Suggest() {
  const { t } = useLocale();
  const [street, setStreet] = useState("");
  const [shops, setShops] = useState("");
  return (
    <Screen
      back
      title={t("ms.suggest.title")}
      footer={
        <Button
          fullWidth
          disabled={!street.trim() || !SUPPORT_EMAIL}
          // l10n-ok: this email is read by the Local Loyalty team, in English
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Bring ${BRAND.name} to ${street}`)}&body=${encodeURIComponent(`Street: ${street}\nShops I’d love to see: ${shops}`)}`)}
        >
          {t("ms.suggest.send")}
        </Button>
      }
    >
      <Text color="fgMuted">{t("ms.suggest.intro")}</Text>
      <TextField label={t("ms.suggest.street")} value={street} onChangeText={setStreet} />
      <TextField label={t("ms.suggest.shops")} optionalLabel value={shops} onChangeText={setShops} multiline />
    </Screen>
  );
}
