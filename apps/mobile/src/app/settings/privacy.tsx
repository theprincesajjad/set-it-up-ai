import { BRAND } from "@ll/shared";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Linking, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { usePhase2, useWallet } from "../../features/customer/queries";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, Card, ConfirmDialog, Download, ListRow, Screen, Section, Text, TextField, Trash2, useToast } from "../../ui";

/** 10.3 Privacy & data: export (PIPEDA access) and delete account. */
export default function Privacy() {
  const toast = useToast();
  const { signOut } = useSession();
  const wallet = useWallet();
  const phase2 = usePhase2();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shops = wallet.data?.items ?? [];
  const openWork = phase2.tickets.some((x) => !["picked_up", "cancelled", "declined"].includes(x.status)) || phase2.orders.some((o) => ["pending", "accepted", "preparing", "ready"].includes(o.status));
  const openShop = phase2.tickets.find((x) => !["picked_up", "cancelled", "declined"].includes(x.status))?.merchantName ?? phase2.orders.find((o) => ["pending", "accepted", "preparing", "ready"].includes(o.status))?.merchantName;

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.me.exportData();
      const file = new File(Paths.cache, `my-${BRAND.shortName.toLowerCase()}-data.json`);
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your data" });
      toast({ tone: "success", message: "Your data file is ready." });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e, { network: t("err.network"), server: t("err.server") }) });
    } finally {
      setExporting(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.me.deleteAccount();
      await signOut();
      router.replace({ pathname: "/welcome" });
      toast("Your account is deleted.");
    } catch (e) {
      setError(isApiError(e) && e.status === 409 ? e.message : errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
  };

  return (
    <Screen back title="Privacy & data">
      <Section title="Download my data">
        <Text color="fgMuted">A file with your profile, shops, points and messages. It downloads to this phone so you can save or send it.</Text>
        <Button variant="secondary" iconStart={Download} loading={exporting} onPress={exportData}>
          Request my data
        </Button>
      </Section>
      <Section title="Delete my account">
        <Card tone="sunken">
          <Text>{`Your card stops working at every shop. Everything you've collected at ${shops.length === 1 ? "your shop" : `your ${shops.length} shops`} (points, stamps and rewards) will be lost. Shops keep records of past purchases as the law requires, without your name.`}</Text>
        </Card>
        {openWork ? <Banner variant="warning">{`Finish or cancel your open repair or order at ${openShop ?? "the shop"} first.`}</Banner> : null}
        <TextField label='Type "DELETE" to confirm' value={typed} onChangeText={setTyped} autoCapitalize="characters" />
        {error ? <Banner variant="danger">{error}</Banner> : null}
        <Button variant="danger" iconStart={Trash2} disabled={typed !== "DELETE" || openWork} onPress={() => setConfirm(true)}>
          {t("destructive.deleteAccount")}
        </Button>
      </Section>
      <View>
        <ListRow title="Privacy Policy" chevron onPress={() => Linking.openURL("https://local.example/privacy")} />
        <ListRow title="Terms" chevron onPress={() => Linking.openURL("https://local.example/terms")} />
        <ListRow title="How shops use your data" chevron divider={false} onPress={() => Linking.openURL("https://local.example/privacy#shops")} />
      </View>
      <ConfirmDialog
        visible={confirm}
        title="Delete your account?"
        body="This can't be undone. Your card stops working everywhere and your points are lost."
        confirmLabel={t("destructive.deleteAccount")}
        loading={deleting}
        onCancel={() => setConfirm(false)}
        onConfirm={del}
      />
    </Screen>
  );
}
