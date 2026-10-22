import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { Avatar, Banner, Button, Card, EmptyState, ListRow, MapPin, Screen, Section, ShopLogo, SkeletonList, Store, SwitchRow, Text } from "../../ui";

/** Pick merchant + location; optionally lock this device to the shop's counter (shared device → PIN switcher). */
export default function SelectCounter() {
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
  const detail = useQuery({ queryKey: ["counter", "select", merchantId ?? ""], queryFn: () => api.merchant.detail(merchantId!), enabled: !!merchantId });
  const locations = (detail.data?.locations ?? []).filter((l) => l.active);

  const start = (locationId: string, locationName: string) => {
    const me = merchants.find((m) => m.merchantId === merchantId);
    setConfig({ locationId, locationName });
    if (config.sharedDevice) {
      setDeviceStaff(null);
      router.replace("/counter/pin");
    } else {
      setDeviceStaff(user && me ? { userId: user.id, name: user.name, role: me.role, viaPin: false } : null);
      router.replace("/counter");
    }
  };

  return (
    <Screen title="Counter mode" largeTitle>
      {merchants.length === 0 ? (
        <>
          <EmptyState icon={Store} title="You're not staff at a shop yet" body="Ask the owner to add you as staff, then sign in again." />
          <Button
            variant="secondary"
            onPress={() => {
              setMode("customer");
              router.replace("/home");
            }}
          >
            Use the customer app
          </Button>
          <Button variant="ghost" onPress={async () => { await signOut({ keepQueue: true }); router.replace("/welcome"); }}>
            Sign out
          </Button>
        </>
      ) : (
        <>
          <Section title="Shop">
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {merchants.map((m, i) => (
                <ListRow
                  key={m.merchantId}
                  divider={i < merchants.length - 1}
                  leading={<ShopLogo shop={{ name: m.name, vertical: "other", logoUrl: m.logoUrl }} size={40} />}
                  title={m.name}
                  subtitle={`${m.role.charAt(0).toUpperCase()}${m.role.slice(1)}${m.status === "paused" ? " · Program paused" : ""}`}
                  selected={m.merchantId === merchantId}
                  minHeight={64}
                  onPress={() => setConfig({ merchantId: m.merchantId, merchantName: m.name, locationId: null, locationName: null })}
                />
              ))}
            </Card>
          </Section>
          {merchantId ? (
            <Section title="Location">
              {detail.isLoading ? (
                <SkeletonList rows={2} rowHeight={64} />
              ) : locations.length === 0 ? (
                <Banner variant="warning">This shop has no active locations. Add one in the dashboard.</Banner>
              ) : (
                <Card padded={false} style={{ paddingHorizontal: 16 }}>
                  {locations.map((l, i) => (
                    <ListRow key={l.id} divider={i < locations.length - 1} leadingIcon={MapPin} title={l.name} subtitle={l.address} minHeight={64} chevron onPress={() => start(l.id, l.name)} />
                  ))}
                </Card>
              )}
            </Section>
          ) : null}
          <Card>
            <SwitchRow
              label="Use this device as the shop's counter"
              description="Staff switch with their PIN. The customer app is hidden on this device."
              value={config.sharedDevice}
              onValueChange={(v) => setConfig({ sharedDevice: v })}
            />
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={user?.name} id={user?.id} size={32} />
            <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>{`Signed in as ${user?.name ?? user?.email ?? "staff"}`}</Text>
            {!config.sharedDevice ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setMode("customer");
                  router.replace("/home");
                }}
              >
                Customer app
              </Button>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}
