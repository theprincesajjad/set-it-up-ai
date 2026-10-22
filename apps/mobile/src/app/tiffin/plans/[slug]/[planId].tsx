import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../../../api/client";
import { t as copy } from "../../../../copy/en-CA";
import { ChipGroup, DateField, DietBadges, InfoRow, StepperRow, useDaysLabel, usePayment, WeekdayDots } from "../../../../features/restaurant/components";
import { rk, useTiffinPlans } from "../../../../features/restaurant/queries";
import { newIdempotencyKey } from "../../../../lib/ids";
import { useLocale } from "../../../../lib/i18n";
import { addDays, dayToDate, earliestStart, firstServiceDay, isPostalCode, normalizePostalCode, planFulfilments, planPriceCents, torontoToday, weekdayOf } from "../../../../lib/restaurant";
import { api } from "../../../../state/api";
import { useOnline } from "../../../../state/network";
import { disp, ui } from "../../../../theme";
import { Banner, Button, EmptyState, ErrorState, Screen, SegmentedControl, Section, Sheet, SkeletonList, Store, Text, TextField, useToast } from "../../../../ui";

/** Plan detail: days, servings with the live price, delivery or pickup, the upcoming menu, then the subscribe sheet. */
export default function TiffinPlanDetail() {
  const { slug, planId } = useLocalSearchParams<{ slug: string; planId: string }>();
  const { t, money, date, pick } = useLocale();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useTiffinPlans(slug);
  const daysLabel = useDaysLabel();
  const plan = q.data?.plans.find((p) => p.id === planId) ?? null;
  const [servings, setServings] = useState(1);
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup" | null>(null);
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [postal, setPostal] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [method, setMethod] = useState<"card" | "pad">("card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const pay = usePayment(() => void qc.invalidateQueries({ queryKey: rk.subs }));
  const today = torontoToday();

  const fulfilments = useMemo(() => (plan ? planFulfilments(plan) : []), [plan]);
  if (q.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (!plan || !q.data) {
    return (
      <Screen back title={t("rest.tiffin.plan")}>
        {q.data ? <EmptyState icon={Store} title={t("rest.tiffin.gone.title")} body={t("rest.tiffin.gone.body")} /> : <ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => q.refetch()} />}
      </Screen>
    );
  }
  const tr = pick(plan);
  const mode = fulfilment && fulfilments.includes(fulfilment) ? fulfilment : (fulfilments[0] ?? "pickup");
  const total = planPriceCents(plan, servings, mode);
  const per = t(plan.cadence === "weekly" ? "rest.perWeek" : "rest.perMonth");
  const minStart = earliestStart(plan, today);
  const start = startDate ?? firstServiceDay(plan.daysOfWeek, minStart);
  const postalOk = mode === "pickup" || isPostalCode(postal);
  const addressOk = mode === "pickup" || address.trim().length >= 3;
  const valid = postalOk && addressOk;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.tiffin.subscribe(
        {
          planId: plan.id,
          servings,
          fulfilment: mode,
          ...(mode === "delivery" ? { address: address.trim(), postalCode: postal.trim().toUpperCase(), ...(addressNotes.trim() ? { addressNotes: addressNotes.trim() } : {}) } : {}),
          ...(dietaryNotes.trim() ? { dietaryNotes: dietaryNotes.trim() } : {}),
          startDate: start,
          paymentMethod: method,
        },
        idemKey,
      );
      void qc.invalidateQueries({ queryKey: rk.subs });
      setOpen(false);
      toast({ tone: "success", message: t("rest.tiffin.subscribed", { plan: tr.name }) });
      router.replace(`/tiffin/${res.subscription.id}`);
      // The card is confirmed on the web pay page; the subscription screen shows "pay now" if it is not finished.
      if (res.payment) await pay(res.payment);
    } catch (e) {
      if (isApiError(e) && e.status < 500) setIdemKey(newIdempotencyKey());
      setError(errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      back
      title={t("rest.tiffin.plan")}
      onRefresh={() => q.refetch()}
      refreshing={q.isRefetching}
      footer={
        <Button size="lg" fullWidth onPress={() => setOpen(true)}>
          {`${t("rest.tiffin.subscribe")} · ${money(total)} ${per}`}
        </Button>
      }
    >
      <View style={{ gap: 10 }}>
        <Text style={disp(26, 800, 30, -0.01)} accessibilityRole="header">
          {tr.name}
        </Text>
        {tr.description ? <Text color="fgMuted">{tr.description}</Text> : null}
        <DietBadges dietary={plan.dietary} />
        {plan.dietary.halalCertifier && (plan.dietary.halal || plan.dietary.zabihah) ? (
          <Text variant="meta" color="fgMuted">{`${t("diet.certifiedBy", { certifier: plan.dietary.halalCertifier })}. ${t("diet.shopClaim")}`}</Text>
        ) : plan.dietary.halal || plan.dietary.zabihah ? (
          <Text variant="meta" color="fgMuted">
            {t("diet.shopClaim")}
          </Text>
        ) : null}
      </View>

      <Section title={t("rest.tiffin.days")} spaced>
        <WeekdayDots days={plan.daysOfWeek} />
        <Text variant="meta" color="fgMuted">{`${daysLabel(plan.daysOfWeek)} · ${t("rest.tiffin.mealsPerDay", { n: plan.mealsPerDay })} · ${t("rest.tiffin.cutoff", { n: plan.cutoffHours })}`}</Text>
      </Section>

      <Section title={t("rest.tiffin.yourPlan")} spaced>
        <StepperRow label={t("rest.tiffin.servings")} hint={plan.extraServingCents > 0 ? t("rest.tiffin.extraServing", { price: money(plan.extraServingCents) }) : undefined} value={servings} max={plan.maxServings} onChange={setServings} />
        {fulfilments.length > 1 ? (
          <SegmentedControl
            accessibilityLabel={t("rest.tiffin.how")}
            value={mode}
            onChange={setFulfilment}
            options={fulfilments.map((f) => ({ value: f, label: t(f === "delivery" ? "delivery.title" : "delivery.pickup") }))}
          />
        ) : (
          <Text variant="meta" color="fgMuted">
            {t(mode === "delivery" ? "rest.tiffin.deliveryOnly" : "rest.tiffin.pickupOnly")}
          </Text>
        )}
        <View style={{ gap: 2 }} accessible accessibilityLabel={`${money(total)} ${per}`}>
          <Text style={disp(32, 800, 36, -0.01)} tabular>
            {money(total)}
            <Text style={ui(15, 500, 20)} color="fgMuted">{` ${per}`}</Text>
          </Text>
          <InfoRow label={t("rest.tiffin.baseServing")} value={money(plan.priceCents)} />
          {servings > 1 && plan.extraServingCents > 0 ? <InfoRow label={t("rest.tiffin.extraServings", { n: servings - 1 })} value={money(plan.extraServingCents * (servings - 1))} /> : null}
          {mode === "delivery" && plan.deliveryFeeCents > 0 ? <InfoRow label={t("rest.tiffin.deliveryFee")} value={money(plan.deliveryFeeCents)} /> : null}
        </View>
      </Section>

      <Section title={t("rest.tiffin.menu")} spaced>
        {plan.upcomingMenu.length === 0 ? (
          <Text color="fgMuted">{t("rest.tiffin.menuSoon")}</Text>
        ) : (
          plan.upcomingMenu.slice(0, 5).map((d) => (
            <View key={d.date} style={{ gap: 4 }}>
              <Text variant="bodyStrong">{date(dayToDate(d.date), { weekday: "long", day: "numeric", month: "short" })}</Text>
              {d.items.map((it, i) => (
                <View key={`${it.name}-${i}`} style={{ gap: 4 }}>
                  <Text>{it.name}</Text>
                  {it.description ? (
                    <Text variant="meta" color="fgMuted">
                      {it.description}
                    </Text>
                  ) : null}
                  <DietBadges dietary={it.dietary} />
                </View>
              ))}
              {d.notes ? (
                <Text variant="meta" color="fgMuted">
                  {d.notes}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Section>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t("rest.tiffin.subscribe")}
        footer={
          <Button size="lg" fullWidth loading={submitting} onPress={submit}>
            {`${t("rest.tiffin.subscribeAndPay")} · ${money(total)}`}
          </Button>
        }
      >
        <Text color="fgMuted">{`${tr.name} · ${t("rest.tiffin.servingsCount", { n: servings })} · ${t(mode === "delivery" ? "delivery.title" : "delivery.pickup")}`}</Text>
        {error ? <Banner variant="danger">{error}</Banner> : null}
        {mode === "delivery" ? (
          <>
            <TextField label={t("delivery.address")} value={address} onChangeText={setAddress} autoComplete="street-address" textContentType="fullStreetAddress" maxLength={300} error={touched && !addressOk ? t("rest.err.address") : null} />
            <TextField
              label={t("rest.tiffin.postal")}
              value={postal}
              onChangeText={(v) => setPostal(normalizePostalCode(v))}
              autoCapitalize="characters"
              autoComplete="postal-code"
              textContentType="postalCode"
              placeholder="L4T 1A1"
              maxLength={7}
              hint={t("rest.tiffin.postalHint")}
              error={touched && !postalOk ? t("rest.err.postal") : null}
            />
            <TextField label={t("rest.tiffin.addressNotes")} optionalLabel value={addressNotes} onChangeText={setAddressNotes} maxLength={500} placeholder={t("rest.tiffin.addressNotesEg")} />
          </>
        ) : null}
        <TextField label={t("rest.tiffin.dietaryNotes")} optionalLabel value={dietaryNotes} onChangeText={setDietaryNotes} maxLength={500} placeholder={t("rest.tiffin.dietaryNotesEg")} />
        <DateField
          label={t("rest.tiffin.startDate")}
          placeholder={t("rest.pickDate")}
          value={start}
          onChange={setStartDate}
          min={minStart}
          max={addDays(today, 60)}
          hint={plan.daysOfWeek.includes(weekdayOf(start)) ? null : t("rest.tiffin.firstMeal", { date: date(dayToDate(firstServiceDay(plan.daysOfWeek, start)), { weekday: "long", day: "numeric", month: "short" }) })}
        />
        {q.data.padEnabled ? (
          <ChipGroup
            label={t("rest.tiffin.payWith")}
            value={method}
            onChange={setMethod}
            options={[
              { value: "card", label: t("rest.tiffin.card") },
              { value: "pad", label: t("rest.tiffin.pad") },
            ]}
          />
        ) : null}
        <View style={{ gap: 2 }}>
          <InfoRow label={t("rest.tiffin.dueToday")} value={money(total)} strong />
          <Text variant="meta" color="fgMuted">
            {t(plan.cadence === "weekly" ? "rest.tiffin.renewsWeekly" : "rest.tiffin.renewsMonthly")}
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
