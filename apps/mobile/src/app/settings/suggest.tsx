import { BRAND } from "@ll/shared";
import { useState } from "react";
import { Linking } from "react-native";
import { Button, Screen, Text, TextField } from "../../ui";

/** "Suggest my street" (empty.noNeighbourhood). Sent by email until there's an API for it. */
export default function Suggest() {
  const [street, setStreet] = useState("");
  const [shops, setShops] = useState("");
  return (
    <Screen
      back
      title="Suggest my street"
      footer={
        <Button
          fullWidth
          disabled={!street.trim()}
          onPress={() => Linking.openURL(`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`Bring ${BRAND.name} to ${street}`)}&body=${encodeURIComponent(`Street: ${street}\nShops I'd love to see: ${shops}`)}`)}
        >
          Send suggestion
        </Button>
      }
    >
      <Text color="fgMuted">We launch one neighbourhood at a time. Tell us where you shop.</Text>
      <TextField label="Street or neighbourhood" value={street} onChangeText={setStreet} />
      <TextField label="Shops you'd like to see" optionalLabel value={shops} onChangeText={setShops} multiline />
    </Screen>
  );
}
