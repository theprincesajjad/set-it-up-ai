import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Avatar, Banner, Button, Card, Check, EmptyState, ListRow, MapPin, Screen, Section, ShopLogo, SkeletonList, Store, SwitchRow, Text } from "../../ui";

/** Pick merchant + location; optionally lock this device to the shop's counter (shared device → PIN switcher). */
export default function SelectCounter() {
  const fg = useTheme().c.fg;
  const { t } = useLocale();
  const { merchants, refreshMe, user, setMode, signOut } = useSession();
  const { config, setConfig, setDeviceStaff, ready } = useCounter();
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);
  const merchantId = config.merchantId;
  // Most staff work at one shop: pick it for them so the next tap is the location.
  const only = merchants.length === 1 ? merchants[0] : null;
  useEffect(() => {
    if (ready && !merchantId && only) setConfig({ merchantId: only.merchantId, merchantName: only.name, locationId: null, locationName: null });
  }, [ready, merchantId, only, setConfig]);
  const roleLabel = (role: string) => (role === "owner" ? t("mc.role.owner") : role === "manager" ? t("mc.role.manager") : role === "staff" ? t("mc.role.staff") : role);
  const detail = useQuery({ queryKey: ["counter", "select", merchantId ?? ""], queryFn: () => api.merchant.detail(merchantId!), enabled: !!merchantId });
  const locations = (detail.data?.locations ?? []).filter((l) => l.active);

  const start = (locationId: string, locationName: string, locationAddress: string | null) => {
    const me = merchants.find((m) => m.merchantId === merchantId);
    setConfig({ locationId, locationName, locationAddress });
    if (config.sharedDevice) {
      setDeviceStaff(null);
      router.replace("/counter/pin");
    } else {
      setDeviceStaff(user && me ? { userId: user.id, name: user.name, role: me.role, viaPin: false } : null);
      router.replace("/counter");
    }
  };

  return (
    <Screen title={t("mc.sel.title")} largeTitle>
      {merchants.length === 0 ? (
        <>
          <EmptyState icon={Store} title={t("mc.sel.notStaff")} body={t("mc.sel.notStaffBody")} />
          <Button
            variant="secondary"
            onPress={() => {
              setMode("customer");
              router.replace("/map");
            }}
          >
            {t("mc.sel.useCustomer")}
          </Button>
          <Button variant="ghost" onPress={async () => { await signOut({ keepQueue: true }); router.replace("/welcome"); }}>
            {t("err.action.signOut")}
          </Button>
        </>
      ) : (
        <>
          <Section title={t("mc.sel.shop")} rule={false}>
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {merchants.map((m, i) => (
                <ListRow
                  key={m.merchantId}
                  divider={i < merchants.length - 1}
                  leading={<ShopLogo shop={{ name: m.name, vertical: "other", logoUrl: m.logoUrl }} size={40} />}
                  title={m.name}
                  subtitle={`${roleLabel(m.role)}${m.status === "paused" ? ` · ${t("mc.sel.paused")}` : ""}`}
                  // Selected = a check, like an iOS picker; a fill inside a padded card looked inset (polish-audit C2).
                  trailing={m.merchantId === merchantId ? <Check size={20} color={fg} strokeWidth={2.25} /> : null}
                  minHeight={64}
                  onPress={() => setConfig({ merchantId: m.merchantId, merchantName: m.name, locationId: null, locationName: null })}
                />
              ))}
            </Card>
          </Section>
          {merchantId ? (
            <Section title={t("counter.location")} rule={false}>
              {detail.isLoading ? (
                <SkeletonList rows={2} rowHeight={64} />
              ) : locations.length === 0 ? (
                <Banner variant="warning">{t("mc.sel.noLocations")}</Banner>
              ) : (
                <Card padded={false} style={{ paddingHorizontal: 16 }}>
                  {locations.map((l, i) => (
                    <ListRow key={l.id} divider={i < locations.length - 1} leadingIcon={MapPin} title={l.name} subtitle={l.address} minHeight={64} chevron onPress={() => start(l.id, l.name, l.address ?? null)} />
                  ))}
                </Card>
              )}
            </Section>
          ) : null}
          <Card>
            <SwitchRow
              label={t("mc.sel.useDevice")}
              description={t("mc.sel.useDeviceHint")}
              value={config.sharedDevice}
              onValueChange={(v) => setConfig({ sharedDevice: v })}
            />
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={user?.name} id={user?.id} size={32} />
            <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>{t("mc.sel.signedInAs", { name: user?.name ?? user?.email ?? t("mc.sel.staffFallback") })}</Text>
            {!config.sharedDevice ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setMode("customer");
                  router.replace("/map");
                }}
              >
                {t("mc.sel.customerApp")}
              </Button>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}
