import { restaurantApi, type MessageKey } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "../../api/client";
import { t as copy } from "../../copy/en-CA";
import { ChipGroup, DateField } from "../../features/restaurant/components";
import { featureOff, rk } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { LanguageSwitcher } from "../../lib/i18n/LanguageSwitcher";
import { addDays, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { disp } from "../../theme";
import { Banner, Button, ErrorState, LockedFeature, Screen, SkeletonList, Store, Text, TextField, useToast } from "../../ui";

/** Catering inquiry: event type chips, date, headcount, service, venue and dietary notes. Lands in My events. */
export default function CateringInquiry() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useLocale();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const shop = useQuery({ queryKey: qk.shop(slug ?? ""), queryFn: () => api.network.shop(slug!), enabled: !!slug });
  const [type, setType] = useState<restaurantApi.CateringEventType | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [guests, setGuests] = useState("");
  const [service, setService] = useState<restaurantApi.CateringService>("delivery");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [dietary, setDietary] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = torontoToday();

  if (shop.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (!shop.data) return <Screen back title={t("rest.cat.title")}><ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => shop.refetch()} /></Screen>;
  const s = shop.data;
  if (s.features.catering === false) return <Screen back title={t("rest.cat.title")}><LockedFeature icon={Store} title={t("rest.cat.title")} body={t("rest.cat.notOffered")} /></Screen>;

  const count = Number.parseInt(guests, 10);
  const guestsOk = Number.isInteger(count) && count >= 1 && count <= 5000;
  const needsVenue = service !== "pickup";
  const valid = !!type && !!day && guestsOk;

  const submit = async () => {
    setTouched(true);
    if (!valid || !type || !day) return;
    setBusy(true);
    setError(null);
    try {
      const ev = await api.catering.inquire({
        merchantId: s.merchant.id,
        eventType: type,
        eventDate: day,
        headcount: count,
        service,
        ...(needsVenue && venueName.trim() ? { venueName: venueName.trim() } : {}),
        ...(needsVenue && venueAddress.trim() ? { venueAddress: venueAddress.trim() } : {}),
        ...(dietary.trim() ? { dietaryNotes: dietary.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      void qc.invalidateQueries({ queryKey: rk.events });
      toast({ tone: "success", message: t("catering.thanks") });
      router.replace(`/events/${ev.id}`);
    } catch (e) {
      setError(featureOff(e) ? t("rest.cat.notOffered") : errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={t("rest.cat.title")}
      footer={
        <Button size="lg" fullWidth loading={busy} onPress={submit}>
          {t("catering.submit")}
        </Button>
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={disp(24, 800, 28, -0.01)} accessibilityRole="header">
          {s.merchant.name}
        </Text>
        <Text color="fgMuted">{t("rest.cat.intro")}</Text>
      </View>
      <LanguageSwitcher />
      <ChipGroup label={t("catering.eventType")} value={type} onChange={setType} options={restaurantApi.CATERING_EVENT_TYPES.map((v) => ({ value: v, label: t(`event.${v}` as MessageKey) }))} />
      {touched && !type ? <Text variant="meta" color="negative">{t("rest.err.eventType")}</Text> : null}
      <DateField label={t("catering.eventDate")} value={day} onChange={setDay} min={addDays(today, 1)} max={addDays(today, 730)} />
      {touched && !day ? <Text variant="meta" color="negative">{t("rest.err.eventDate")}</Text> : null}
      <TextField label={t("catering.guests")} value={guests} onChangeText={(v) => setGuests(v.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="150" maxLength={4} error={touched && !guestsOk ? t("rest.err.guests") : null} />
      <ChipGroup
        label={t("rest.cat.service")}
        value={service}
        onChange={setService}
        options={restaurantApi.CATERING_SERVICES.map((v) => ({ value: v, label: t(`rest.cat.service.${v}` as MessageKey) }))}
      />
      {needsVenue ? (
        <>
          <TextField label={t("rest.cat.venueName")} optionalLabel value={venueName} onChangeText={setVenueName} maxLength={200} />
          <TextField label={t("catering.venue")} optionalLabel value={venueAddress} onChangeText={setVenueAddress} maxLength={400} />
        </>
      ) : null}
      <TextField label={t("rest.cat.dietary")} optionalLabel value={dietary} onChangeText={setDietary} multiline maxLength={2000} placeholder={t("rest.cat.dietaryEg")} />
      <TextField label={t("catering.message")} optionalLabel value={notes} onChangeText={setNotes} multiline maxLength={4000} />
      <Text variant="caption" color="fgMuted">
        {t("rest.cat.noCharge")}
      </Text>
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}
