import { BRAND } from "@ll/shared";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Linking, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { usePhase2, useWallet } from "../../features/customer/queries";
import { api } from "../../state/api";
import { useLocale } from "../../lib/i18n";
import { useSession } from "../../state/session";
import { Banner, Button, ConfirmDialog, Download, ListRow, Screen, Section, Text, TextField, Trash2, useToast } from "../../ui";

/** 10.3 Privacy & data: export (PIPEDA access) and delete account. */
export default function Privacy() {
  const toast = useToast();
  const { t: lt } = useLocale();
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
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: lt("sh.priv.data") });
      toast({ tone: "success", message: lt("sh.priv.m.dlReady") });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e, { network: lt("auth.err.network"), server: lt("auth.err.server") }) });
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
      toast(lt("sh.priv.m.deleted"));
    } catch (e) {
      setError(isApiError(e) && e.status === 409 ? e.message : errorMessage(e, { network: lt("auth.err.network"), server: lt("auth.err.server") }));
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
  };

  return (
    <Screen back title={lt("sh.you.privacy")}>
      <Section title={lt("sh.priv.download")} spaced>
        <Text color="fgMuted">{lt("sh.priv.m.dlBody")}</Text>
        <Button variant="secondary" iconStart={Download} loading={exporting} onPress={exportData}>
          {lt("sh.priv.m.request")}
        </Button>
      </Section>
      <Section title={lt("sh.priv.delete")} spaced>
        <Text>{lt("sh.priv.m.delBody", { shops: lt("sh.priv.m.yourShops", { n: shops.length }) })}</Text>
        {openWork ? <Banner variant="warning">{lt("sh.priv.m.openWork", { shop: openShop ?? lt("sh.priv.m.theShop") })}</Banner> : null}
        <TextField label={lt("sh.priv.deleteType")} value={typed} onChangeText={setTyped} autoCapitalize="characters" />
        {error ? <Banner variant="danger">{error}</Banner> : null}
        <Button variant="danger" iconStart={Trash2} disabled={typed !== "DELETE" || openWork} onPress={() => setConfirm(true)}>
          {lt("sh.priv.delete")}
        </Button>
      </Section>
      <View>
        <ListRow title={lt("sh.priv.m.policy")} chevron onPress={() => Linking.openURL("https://local.example/privacy")} />
        <ListRow title={lt("sh.priv.m.terms")} chevron onPress={() => Linking.openURL("https://local.example/terms")} />
        <ListRow title={lt("sh.priv.m.howShops")} chevron divider={false} onPress={() => Linking.openURL("https://local.example/privacy#shops")} />
      </View>
      <ConfirmDialog
        visible={confirm}
        title={lt("sh.priv.deleteTitle")}
        body={lt("sh.priv.m.cantUndo")}
        confirmLabel={lt("sh.priv.delete")}
        loading={deleting}
        onCancel={() => setConfirm(false)}
        onConfirm={del}
      />
    </Screen>
  );
}
