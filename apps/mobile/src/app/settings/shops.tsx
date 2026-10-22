import { BRAND, customerApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { t } from "../../copy/en-CA";
import { useWallet } from "../../features/customer/queries";
import { termWord } from "../../lib/award";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { Button, Card, ConsentCheckbox, EmptyState, ListRow, Screen, Sheet, ShopLogo, Store, SwitchRow, Text, useToast } from "../../ui";

/** 10.1 Shops & messages: per-shop offers consent (CASL) and mute. */
export default function ShopsAndMessages() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const toast = useToast();
  const { prefs, updatePrefs } = useSession();
  const [open, setOpen] = useState<customerApi.MembershipDto | null>(null);
  const [granting, setGranting] = useState<customerApi.MembershipDto | null>(null);
  const [agree, setAgree] = useState(false);
  const items = wallet.data?.items ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: qk.wallet });

  const withdraw = async (m: customerApi.MembershipDto) => {
    try {
      await api.me.withdrawConsent(m.id);
      await refresh();
      toast(t("consent.withdrawn", { shop: m.merchant.name, terminology: termWord(m.terminology) }));
    } catch {
      toast({ tone: "error", message: t("err.network") });
    }
  };
  const grant = async (m: customerApi.MembershipDto) => {
    try {
      await api.me.grantConsent(m.id, customerApi.marketingConsentText(m.merchant.name));
      await refresh();
      toast(t("ok.consent.on", { shop: m.merchant.name }));
    } catch {
      toast({ tone: "error", message: t("err.network") });
    } finally {
      setGranting(null);
      setAgree(false);
    }
  };
  const setMuted = async (m: customerApi.MembershipDto, muted: boolean) => {
    try {
      await api.me.setMuted(m.id, muted);
      await refresh();
      toast(muted ? t("ok.muted", { shop: m.merchant.name, terminology: termWord(m.terminology) }) : t("ok.unmuted", { shop: m.merchant.name }));
    } catch {
      toast({ tone: "error", message: t("err.network") });
    }
  };
  const current = open ? (items.find((x) => x.id === open.id) ?? open) : null;

  return (
    <Screen back title="Shops & messages">
      <Text color="fgMuted">You choose who can send you offers. Your points keep working either way.</Text>
      {items.length === 0 ? (
        <EmptyState icon={Store} title={t("empty.wallet.title")} body={t("empty.wallet.body")} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {items.map((m) => (
            <ListRow
              key={m.id}
              leading={<ShopLogo shop={m.merchant} size={40} />}
              title={m.merchant.name}
              subtitle={`${m.muted ? "Muted · " : ""}Offers by text and email: ${m.marketingConsent.granted && !m.muted ? "On" : "Off"}`}
              chevron
              onPress={() => setOpen(m)}
            />
          ))}
        </Card>
      )}
      <Card>
        <SwitchRow label={`${BRAND.name} news and neighbourhood events`} description="By email. Saved on this device." value={prefs.platformConsent} onValueChange={(v) => updatePrefs({ platformConsent: v })} />
      </Card>

      <Sheet visible={!!current} onClose={() => setOpen(null)} title={current?.merchant.name}>
        {current ? (
          <View>
            <SwitchRow
              label="Offers by text and email"
              description={current.marketingConsent.granted ? `Since ${current.marketingConsent.grantedAt?.slice(0, 10) ?? ""}` : "Off"}
              value={current.marketingConsent.granted}
              onValueChange={(v) => (v ? setGranting(current) : withdraw(current))}
            />
            <SwitchRow
              label={`Mute ${current.merchant.name}`}
              description="Hides its promos and stops all offers. Order and repair updates still arrive."
              value={current.muted}
              onValueChange={(v) => setMuted(current, v)}
            />
          </View>
        ) : null}
      </Sheet>
      <Sheet
        visible={!!granting}
        onClose={() => setGranting(null)}
        title="Turn on offers"
        footer={
          <Button fullWidth disabled={!agree} onPress={() => granting && grant(granting)}>
            Turn on offers
          </Button>
        }
      >
        {granting ? (
          <ConsentCheckbox
            text={customerApi.marketingConsentText(granting.merchant.name)}
            checked={agree}
            onChange={setAgree}
            caption={t("consent.merchant.caption.v1", { shop: granting.merchant.name })}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
