import { BRAND, customerApi, type networkApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radii } from "@ll/design-tokens";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { firstName, formatPts } from "../../lib/award";
import { MONTH_NAMES } from "../../lib/format";
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

  const nameError = touched && !first.trim() ? t("err.form.required", { fieldLabel: "First name" }) : null;

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
        const res = await api.me.join({ locationQrCode: join, ...(shopConsent ? { consent: { text: shop.consentText } } : {}) });
        await qc.invalidateQueries({ queryKey: qk.wallet });
        setJoined(res);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setTimeout(() => router.replace("/map"), 1500);
        return;
      }
      toast({ message: t("ok.joined", { firstName: first.trim() }), tone: "success" });
      router.replace("/map");
    } catch (e) {
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
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
            ? t("ok.joinedBonus", { bonus: formatPts(joined.bonusPoints, m.terminology), shop: m.merchant.name })
            : t("ok.joined", { firstName: firstName(user?.name) ?? first })}
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
          {t("action.done")}
        </Button>
      }
    >
      {!isReturning ? (
        <>
          <Text variant="largeTitle" accessibilityRole="header">
            What's your name?
          </Text>
          <TextField label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" error={nameError} onBlur={() => setTouched(true)} />
          <TextField label="Last name" optionalLabel value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" />
          <View style={{ gap: 6 }}>
            <Text variant="metaStrong" color="fgMuted">
              Birthday{" "}
              <Text variant="metaStrong" color="fgSubtle">
                (optional)
              </Text>
            </Text>
            {/* Picker fields look like inputs (radius 10, 52 tall), not capsules (polish-audit M7). */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PickerField label={month ? (MONTH_NAMES[month - 1] ?? "Month") : "Month"} placeholder={!month} a11y={`Birthday month: ${month ? MONTH_NAMES[month - 1] : "not set"}`} onPress={() => setPicker("month")} />
              <PickerField label={day ? String(day) : "Day"} placeholder={!day} a11y={`Birthday day: ${day ?? "not set"}`} onPress={() => setPicker("day")} />
            </View>
            <Text variant="meta" color="fgMuted">
              For a birthday treat at shops that offer one. We never ask for the year.
            </Text>
          </View>
        </>
      ) : (
        <Text variant="largeTitle" accessibilityRole="header" style={{ textTransform: "none" }}>
          {shop ? `Join ${shop.merchant.name}` : "Join this shop"}
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
          {shop.program?.welcomeBonus ? <Text color="fgMuted">{`Get ${formatPts(shop.program.welcomeBonus, shop.program.terminology)} when you join.`}</Text> : null}
          <ConsentCheckbox text={shop.consentText} checked={shopConsent} onChange={setShopConsent} caption={t("consent.merchant.caption.v1", { shop: shop.merchant.name })} />
        </Card>
      ) : !isReturning ? (
        <Card>
          <ConsentCheckbox text={t("consent.global.v1")} checked={globalConsent} onChange={setGlobalConsent} caption={t("consent.global.caption")} />
          <ConsentCheckbox text={t("consent.platform.v1", { brand: BRAND.name })} checked={platformConsent} onChange={setPlatformConsent} />
        </Card>
      ) : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker === "month" ? "Birthday month" : "Birthday day"}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {picker === "month"
            ? MONTH_NAMES.map((name, i) => (
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
