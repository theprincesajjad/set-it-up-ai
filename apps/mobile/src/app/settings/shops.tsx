import { BRAND, customerApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useWallet } from "../../features/customer/queries";
import { termWordL } from "../../lib/formatL";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useLocale } from "../../lib/i18n";
import { useSession } from "../../state/session";
import { Button, Card, ConsentCheckbox, EmptyState, ListRow, Screen, Sheet, ShopLogo, Store, SwitchRow, Text, useToast } from "../../ui";

/** 10.1 Shops & messages: per-shop offers consent (CASL) and mute. */
export default function ShopsAndMessages() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const toast = useToast();
  const L = useLocale();
  const { t: lt } = L;
  const { prefs, updatePrefs } = useSession();
  const [open, setOpen] = useState<customerApi.MembershipDto | null>(null);
  const [granting, setGranting] = useState<customerApi.MembershipDto | null>(null);
  const [agree, setAgree] = useState(false);
  const items = wallet.data?.items ?? [];
  // CASL: what the shopper reads is what is recorded. The API's English sentence in English, the faithful translation otherwise.
  const consentText = (shop: string) => (L.locale === "en" ? customerApi.marketingConsentText(shop) : lt("auth.consent.merchantApp", { shop, brand: BRAND.name }));

  const refresh = () => qc.invalidateQueries({ queryKey: qk.wallet });

  const withdraw = async (m: customerApi.MembershipDto) => {
    try {
      await api.me.withdrawConsent(m.id);
      await refresh();
      toast(lt("cp.consent.withdrawn", { shop: m.merchant.name, terminology: termWordL(L, m.terminology) }));
    } catch {
      toast({ tone: "error", message: lt("auth.err.network") });
    }
  };
  const grant = async (m: customerApi.MembershipDto) => {
    try {
      await api.me.grantConsent(m.id, consentText(m.merchant.name));
      await refresh();
      toast(lt("cp.ok.consentOn", { shop: m.merchant.name }));
    } catch {
      toast({ tone: "error", message: lt("auth.err.network") });
    } finally {
      setGranting(null);
      setAgree(false);
    }
  };
  const setMuted = async (m: customerApi.MembershipDto, muted: boolean) => {
    try {
      await api.me.setMuted(m.id, muted);
      await refresh();
      toast(muted ? lt("cp.ok.muted", { shop: m.merchant.name, terminology: termWordL(L, m.terminology) }) : lt("cp.ok.unmuted", { shop: m.merchant.name }));
    } catch {
      toast({ tone: "error", message: lt("auth.err.network") });
    }
  };
  const current = open ? (items.find((x) => x.id === open.id) ?? open) : null;

  return (
    <Screen back title={lt("sh.you.shopsMessages")}>
      <Text color="fgMuted">{lt("sh.shops.intro")}</Text>
      {items.length === 0 ? (
        <EmptyState icon={Store} title={lt("sh.wallet.emptyTitle")} body={lt("cp.empty.walletBody")} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {items.map((m, i) => (
            <ListRow
              key={m.id}
              divider={i < items.length - 1}
              leading={<ShopLogo shop={m.merchant} size={40} />}
              title={m.merchant.name}
              subtitle={m.muted ? lt("sh.shops.muted") : m.marketingConsent.granted ? lt("sh.shops.on") : lt("sh.shops.off")}
              chevron
              onPress={() => setOpen(m)}
            />
          ))}
        </Card>
      )}
      <Card>
        <SwitchRow label={lt("sh.shops.news", { brand: BRAND.name })} description={lt("sh.shops.newsSub")} value={prefs.platformConsent} onValueChange={(v) => updatePrefs({ platformConsent: v })} />
      </Card>

      <Sheet visible={!!current} onClose={() => setOpen(null)} title={current?.merchant.name}>
        {current ? (
          <View>
            <SwitchRow
              label={lt("sh.priv.offersBy")}
              description={current.marketingConsent.granted ? lt("sh.priv.since", { date: current.marketingConsent.grantedAt?.slice(0, 10) ?? "" }) : lt("sh.shops.off2")}
              value={current.marketingConsent.granted}
              onValueChange={(v) => (v ? setGranting(current) : withdraw(current))}
            />
            <SwitchRow
              label={lt("sh.priv.muteShop", { shop: current.merchant.name })}
              description={lt("sh.shops.muteHint")}
              value={current.muted}
              onValueChange={(v) => setMuted(current, v)}
            />
          </View>
        ) : null}
      </Sheet>
      <Sheet
        visible={!!granting}
        onClose={() => setGranting(null)}
        title={lt("sh.shops.turnOn")}
        footer={
          <Button fullWidth disabled={!agree} onPress={() => granting && grant(granting)}>
            {lt("sh.shops.turnOn")}
          </Button>
        }
      >
        {granting ? (
          <ConsentCheckbox
            text={consentText(granting.merchant.name)}
            checked={agree}
            onChange={setAgree}
            caption={lt("auth.consent.caption", { sender: granting.merchant.name, brand: BRAND.name })}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
