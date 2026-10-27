import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage as apiError, isApiError } from "../../../api/client";
import { useRefreshClasses, useStudio } from "../../../features/classes/queries";
import { useMoney, usePayment } from "../../../features/restaurant/components";
import { featureOff } from "../../../features/restaurant/queries";
import { agreementRows } from "../../../lib/classes";
import { useLocale } from "../../../lib/i18n";
import { api } from "../../../state/api";
import { useOnline } from "../../../state/network";
import { useTheme } from "../../../theme";
import { Banner, Button, Checkbox, ErrorState, hairline, LockedFeature, Screen, SkeletonList, Store, Text, useToast } from "../../../ui";

/**
 * Join a membership (Figma frame 08): the agreement as rows (studio, services, price, payments, dates, how to cancel, renewal) before the
 * card, a box to say you read it, and one button with the amount. Payment is the web page's, like every card payment in the app; coming
 * back, the membership shows under Passes. The agreement hash goes back with the sign-up, so a changed offer asks to read it again.
 */
export default function JoinMembership() {
  const { productId, slug } = useLocalSearchParams<{ productId: string; slug?: string }>();
  const { c } = useTheme();
  const { t } = useLocale();
  const money = useMoney();
  const toast = useToast();
  const online = useOnline();
  const studio = useStudio(slug);
  const refresh = useRefreshClasses();
  const agreement = useQuery({ queryKey: ["classes", "agreement", productId], queryFn: () => api.classes.agreement(productId!), enabled: !!productId, retry: false, staleTime: 0, gcTime: 0 });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    for (let i = 0; i < 12; i++) {
      await refresh();
      const live = (await api.classes.mine().catch(() => null))?.memberships.some((m) => m.status === "active" && (!slug || m.merchant.slug === slug));
      if (live) {
        toast({ message: t("cl.ui.done.member"), tone: "success" });
        router.replace({ pathname: "/classes/passes", params: slug ? { slug } : {} });
        return;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    toast(t("cl.ui.done.processing"));
    router.replace({ pathname: "/classes/passes", params: slug ? { slug } : {} });
  };
  const pay = usePayment(() => void finish());

  const product = studio.data?.products.find((p) => p.id === productId);
  if (agreement.isLoading || studio.isLoading) return <Screen back><SkeletonList rows={5} rowHeight={56} /></Screen>;
  if (agreement.isError || !agreement.data) {
    return (
      <Screen back title={t("cl.ui.agree.title")}>
        {featureOff(agreement.error) ? <LockedFeature icon={Store} title={t("cl.ui.title")} body={t("cl.ui.unavailable")} /> : <ErrorState offline={!online} message={t("cl.app.loadError")} onRetry={() => agreement.refetch()} />}
      </Screen>
    );
  }
  const a = agreement.data;
  const rows = agreementRows(a.text);

  async function start() {
    if (busy || !accepted) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.classes.join({ productId: productId!, agreementHash: a.hash });
      if (r.payment) {
        if (!(await pay(r.payment))) toast(t("rc.error.body"));
      } else await finish();
    } catch (e) {
      const code = isApiError(e) ? e.code : undefined;
      if (code === "agreement_changed") {
        setAccepted(false);
        void agreement.refetch();
        setError(t("cl.ui.agree.changed"));
      } else setError(apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      back
      largeTitle
      titleCase="as-is"
      title={t("cl.app.joinTitle", { name: product?.name ?? a.studio })}
      subtitle={<Text color="fgMuted" style={{ marginTop: 4 }}>{t("cl.app.readFirst")}</Text>}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={!accepted} onPress={() => void start()} testID="join-pay">
          {t("cl.ui.agree.pay", { amount: money(a.totalPerPeriodCents) })}
        </Button>
      }
    >
      {error ? <Banner variant="danger">{error}</Banner> : null}
      <View style={[styles.table, { borderColor: c.line }]} testID="agreement-rows">
        {rows.map((r, i) => (
          <View key={`${r.label}${i}`} style={[styles.row, i > 0 ? { borderTopColor: c.line, borderTopWidth: hairline } : null]}>
            <Text variant="meta" color="fgMuted" style={styles.label}>{r.label}</Text>
            <Text style={styles.value}>{r.value}</Text>
          </View>
        ))}
      </View>
      <Checkbox checked={accepted} onChange={setAccepted} label={t("cl.ui.agree.check")} />
      <Text variant="meta" color="fgMuted">{t("cl.app.payOnWeb")}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: hairline, borderRadius: 16 },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  label: { width: 84 },
  value: { flex: 1 },
});
