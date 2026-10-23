import { BRAND, customerApi, t as translate, type networkApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radii } from "@ll/design-tokens";
import { errorMessage } from "../../api/client";
import { firstName, formatPts } from "../../lib/award";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Button, Card, ChevronDown, Chip, ConsentCheckbox, Screen, Sheet, ShopLogo, StampCard, Text, TextField, useToast } from "../../ui";

/** 1.4 Name and consent (+ Joined success when the user came from a shop QR). */
function PickerField({ label, placeholder, a11y, onPress }: { label: string; placeholder: boolean; a11y: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [pickerStyles.field, { borderColor: c.lineStrong, backgroundColor: pressed ? c.bgSubtle : c.bg }]}>
      <Text color={placeholder ? "fgSubtle" : "fg"} style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronDown size={18} color={c.fgMuted} strokeWidth={2} />
    </Pressable>
  );
}

const pickerStyles = StyleSheet.create({
  field: { flex: 1, minHeight: 52, borderRadius: radii.input, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
});

export default function NameStep() {
  const { t, locale, date } = useLocale();
  const { join, returning } = useLocalSearchParams<{ join?: string; returning?: string }>();
  const { user, updatePrefs, refreshMe } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { c } = useTheme();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [picker, setPicker] = useState<"month" | "day" | null>(null);
  // CASL: never pre-checked.
  const [globalConsent, setGlobalConsent] = useState(false);
  const [platformConsent, setPlatformConsent] = useState(false);
  const [shopConsent, setShopConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<customerApi.JoinResponse | null>(null);

  const joinInfo = useQuery<networkApi.JoinInfoResponse>({ queryKey: ["joinInfo", join ?? ""], queryFn: () => api.network.joinInfo(join!), enabled: !!join });
  const shop = joinInfo.data;
  const isReturning = returning === "1";

  useEffect(() => {
    if (user?.name && !first) {
      const [f, ...rest] = user.name.split(" ");
      setFirst(f ?? "");
      setLast(rest.join(" "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const nameError = touched && !first.trim() ? t("auth.err.required", { field: t("auth.join.firstName") }) : null;
  const monthNames = Array.from({ length: 12 }, (_, i) => date(new Date(Date.UTC(2000, i, 15)), { month: "long" }, "UTC"));
  // CASL: what the customer reads is what we send. The API's English sentence in English; the faithful translation otherwise.
  const shopConsentText = shop ? (locale === "en" ? shop.consentText : translate(locale, "auth.consent.merchantApp", { shop: shop.merchant.name, brand: BRAND.name })) : "";
  const bonusText = (n: number, program: { earnType?: string; terminology: string } | null | undefined) => (locale === "en" ? formatPts(n, program?.terminology ?? "points") : t(program?.earnType === "stamps" ? "auth.unit.stamps" : "auth.unit.points", { n }));

  const finish = async () => {
    setTouched(true);
    if (!first.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const birthday = month && day ? `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined;
      if (!isReturning) {
        await api.me.updateProfile({ name: [first.trim(), last.trim()].filter(Boolean).join(" "), ...(birthday ? { birthday } : {}) });
        updatePrefs({ globalConsent, platformConsent });
        void refreshMe();
      }
      if (join && shop) {
        const res = await api.me.join({ locationQrCode: join, ...(shopConsent ? { consent: { text: shopConsentText } } : {}) });
        await qc.invalidateQueries({ queryKey: qk.wallet });
        setJoined(res);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setTimeout(() => router.replace("/map"), 1500);
        return;
      }
      toast({ message: t("auth.joined.title", { name: first.trim() }), tone: "success" });
      router.replace("/map");
    } catch (e) {
      setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setSaving(false);
    }
  };

  if (joined) {
    const m = joined.membership;
    return (
      <Screen scroll={false} contentStyle={{ justifyContent: "center", alignItems: "center" }}>
        <ShopLogo shop={m.merchant} size={96} />
        {m.program?.earnType === "stamps" ? (
          <StampCard count={m.balance} goal={m.program.stampGoal || 10} vertical={m.merchant.vertical} justEarned compact />
        ) : null}
        <Text variant="largeTitle" center accessibilityLiveRegion="polite" style={{ textTransform: "none" }}>
          {joined.bonusPoints > 0
            ? t("auth.joined.bonusTitle", { bonus: bonusText(joined.bonusPoints, m.program ? { earnType: m.program.earnType, terminology: m.terminology } : { terminology: m.terminology }), shop: m.merchant.name.replace(/\.$/, "") })
            : t("auth.joined.title", { name: firstName(user?.name) ?? first })}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      back={false}
      // Same top as the phone and code steps (their 44 pt bar), so the title doesn't jump (polish-audit M6).
      contentStyle={{ paddingTop: 52 }}
      footer={
        <Button size="lg" fullWidth loading={saving} onPress={finish}>
          {t("auth.m.done")}
        </Button>
      }
    >
      {!isReturning ? (
        <>
          <Text variant="largeTitle" accessibilityRole="header">
            {t("auth.m.name.title")}
          </Text>
          <TextField label={t("auth.join.firstName")} value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" error={nameError} onBlur={() => setTouched(true)} />
          <TextField label={t("auth.m.name.last")} optionalLabel value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" />
          <View style={{ gap: 6 }}>
            <Text variant="metaStrong" color="fgMuted">
              {t("auth.m.name.birthday")}{" "}
              <Text variant="metaStrong" color="fgSubtle">
                {t("auth.m.name.optional")}
              </Text>
            </Text>
            {/* Picker fields look like inputs (radius 10, 52 tall), not capsules (polish-audit M7). */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PickerField label={month ? (monthNames[month - 1] ?? t("auth.m.name.month")) : t("auth.m.name.month")} placeholder={!month} a11y={`${t("auth.m.name.birthdayMonth")}: ${month ? monthNames[month - 1] : t("auth.m.name.notSet")}`} onPress={() => setPicker("month")} />
              <PickerField label={day ? String(day) : t("auth.m.name.day")} placeholder={!day} a11y={`${t("auth.m.name.birthdayDay")}: ${day ?? t("auth.m.name.notSet")}`} onPress={() => setPicker("day")} />
            </View>
            <Text variant="meta" color="fgMuted">
              {t("auth.m.name.birthdayHint")}
            </Text>
          </View>
        </>
      ) : (
        <Text variant="largeTitle" accessibilityRole="header" style={{ textTransform: "none" }}>
          {shop ? t("auth.join.joinShop", { shop: shop.merchant.name }) : t("auth.m.name.joinThis")}
        </Text>
      )}

      {shop ? (
        <Card>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <ShopLogo shop={shop.merchant} size={40} />
            <Text variant="headline" style={{ flex: 1 }}>
              {shop.merchant.name}
            </Text>
          </View>
          {shop.program?.welcomeBonus ? <Text color="fgMuted">{t("auth.m.name.welcomeBonus", { bonus: bonusText(shop.program.welcomeBonus, shop.program) })}</Text> : null}
          <ConsentCheckbox text={shopConsentText} checked={shopConsent} onChange={setShopConsent} caption={t("auth.consent.caption", { sender: shop.merchant.name, brand: BRAND.name })} />
        </Card>
      ) : !isReturning ? (
        <Card>
          <ConsentCheckbox text={t("auth.consent.global")} checked={globalConsent} onChange={setGlobalConsent} caption={t("auth.consent.globalCaption")} />
          <ConsentCheckbox text={t("auth.consent.platform", { brand: BRAND.name })} checked={platformConsent} onChange={setPlatformConsent} />
        </Card>
      ) : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker === "month" ? t("auth.m.name.birthdayMonth") : t("auth.m.name.birthdayDay")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {picker === "month"
            ? monthNames.map((name, i) => (
                <Chip
                  key={name}
                  label={name}
                  selected={month === i + 1}
                  onPress={() => {
                    setMonth(i + 1);
                    setPicker(null);
                  }}
                />
              ))
            : Array.from({ length: month === 2 ? 29 : [4, 6, 9, 11].includes(month ?? 0) ? 30 : 31 }, (_, i) => (
                <Chip
                  key={i}
                  label={String(i + 1)}
                  selected={day === i + 1}
                  onPress={() => {
                    setDay(i + 1);
                    setPicker(null);
                  }}
                />
              ))}
        </View>
      </Sheet>
      <View style={{ height: 1, backgroundColor: c.bg }} />
    </Screen>
  );
}
