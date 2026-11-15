import { BRAND, customerApi, t as translate, type networkApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { errorMessage } from "../../api/client";
import { fieldErrors } from "../../lib/fieldErrors";
import { failKind } from "../../lib/failKind";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { firstName, formatPts } from "../../lib/award";
import { BirthdayField } from "../../features/customer/BirthdayField";
import { birthdayValue, type Birthday } from "../../lib/birthday";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Button, Card, ConsentCheckbox, Screen, ShopLogo, StampCard, Text, TextField, useToast } from "../../ui";

/** 1.4 Name and consent (+ Joined success when the user came from a shop QR). */
export default function NameStep() {
  const { t, locale } = useLocale();
  const { join, returning } = useLocalSearchParams<{ join?: string; returning?: string }>();
  const { user, updatePrefs, refreshMe } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { c } = useTheme();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [birthday, setBirthday] = useState<Birthday>({ month: null, day: null });
  // CASL: never pre-checked.
  const [globalConsent, setGlobalConsent] = useState(false);
  const [shopConsent, setShopConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  /** A double tap on Done must not save twice (state alone updates a frame late). */
  const inFlight = useRef(false);
  const firstRef = useRef<TextInputInstance>(null);
  const [error, setError] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);
  const [joined, setJoined] = useState<customerApi.JoinResponse | null>(null);

  const joinInfo = useQuery<networkApi.JoinInfoResponse>({ queryKey: ["joinInfo", join ?? ""], queryFn: () => api.network.joinInfo(join!), enabled: !!join });
  const shop = joinInfo.data;
  const isReturning = returning === "1";
  /** A QR link that does not resolve: say so, and carry on without it (nothing is joined). */
  const linkFailed = !!join && joinInfo.isError && !shop;
  const linkKind = failKind(joinInfo.error);

  useEffect(() => {
    if (user?.name && !first) {
      const [f, ...rest] = user.name.split(" ");
      setFirst(f ?? "");
      setLast(rest.join(" "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const nameError = touched && !first.trim() ? t("auth.err.required", { field: t("auth.join.firstName") }) : null;
  // CASL: what the customer reads is what we send. The API's English sentence in English; the faithful translation otherwise.
  const shopConsentText = shop ? (locale === "en" ? shop.consentText : translate(locale, "auth.consent.merchantApp", { shop: shop.merchant.name, brand: BRAND.name })) : "";
  const bonusText = (n: number, program: { earnType?: string; terminology: string } | null | undefined) => (locale === "en" ? formatPts(n, program?.terminology ?? "points") : t(program?.earnType === "stamps" ? "auth.unit.stamps" : "auth.unit.points", { n }));

  const finish = async () => {
    if (inFlight.current) return;
    setTouched(true);
    if (!first.trim()) return void firstRef.current?.focus();
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setBirthdayError(null);
    try {
      const birthdayText = birthdayValue(birthday);
      if (!isReturning) {
        const fullName = [first.trim(), last.trim()].filter(Boolean).join(" ");
        await api.me.updateProfile({ name: fullName, locale, ...(birthdayText ? { birthday: birthdayText } : {}) });
        // Set locally first: the tabs send a nameless account back here, and the refresh below may land after we leave.
        updatePrefs({ globalConsent, ...(user ? { user: { ...user, name: fullName } } : {}) });
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
      // A refused birthday is named on the birthday row; anything else goes in the banner.
      const fe = fieldErrors(e, t, locale);
      if (fe.birthday) setBirthdayError(fe.birthday);
      if (fe.birthday && Object.keys(fe).length === 1) return;
      setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  // Opened from a shop QR that does not work: the link screen says so (and offers Try again); joining nothing here would only mislead.
  if (isReturning && linkFailed) return <Redirect href={{ pathname: "/j/[code]", params: { code: join! } }} />;

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
      // Joining a shop from its QR when already signed in: a way out that does not join (the sign-up steps have no back).
      back={isReturning}
      onBack={isReturning ? () => router.replace("/map") : undefined}
      // Same top as the phone and code steps (their 44 pt bar), so the title doesn't jump (polish-audit M6).
      contentStyle={{ paddingTop: isReturning ? 8 : 52 }}
      footer={
        <Button size="lg" fullWidth loading={saving} onPress={finish}>
          {isReturning && shop ? t("auth.join.joinShop", { shop: shop.merchant.name }) : t("auth.m.done")}
        </Button>
      }
    >
      {linkFailed && !isReturning ? <Banner variant="neutral" actionLabel={linkKind === "offline" ? t("err.action.retry") : undefined} onAction={linkKind === "offline" ? () => void joinInfo.refetch() : undefined}>{linkKind === "offline" ? t("err.offline.line") : t("mf.join.bad.line")}</Banner> : null}
      {!isReturning ? (
        <>
          <Text variant="largeTitle" accessibilityRole="header">
            {t("auth.m.name.title")}
          </Text>
          <TextField ref={firstRef} autoFocus={!user?.name} label={t("auth.join.firstName")} value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" error={nameError} onBlur={() => setTouched(true)} />
          <TextField label={t("auth.m.name.last")} optionalLabel value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" />
          <BirthdayField value={birthday} onChange={(b) => { setBirthday(b); setBirthdayError(null); }} error={birthdayError} />
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
        </Card>
      ) : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}

      <View style={{ height: 1, backgroundColor: c.bg }} />
    </Screen>
  );
}
