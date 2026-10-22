import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t as copy } from "../../copy/en-CA";
import { DateField, InfoRow, StatusBadge, subTone, useCountdownText, useNow, usePayment } from "../../features/restaurant/components";
import { rk, useInvalidateTiffin, useMySubscription, useUpcoming } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { addDays, canStillSkip, canUndoSkip, countdownParts, dayToDate, deliveryStatusKey, isPostalCode, normalizePostalCode, subscriptionActions, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, ui, useTheme } from "../../theme";
import { Banner, Button, Card, ConfirmDialog, EmptyState, ErrorState, hairline, ListRow, Screen, Section, Sheet, SkeletonList, Text, TextField, Ticket, useToast } from "../../ui";

type Charge = import("@ll/shared").tiffinApi.ChargeDto;

const CHARGE_TONE: Record<Charge["status"], "success" | "danger" | "warning" | "neutral"> = { paid: "success", failed: "danger", pending: "warning", refunded: "neutral" };

/**
 * My tiffin subscription: next meals with cutoff countdowns and Skip / Undo, pause until a date, resume,
 * cancel, change address, charges, and retry payment when past due. Push taps for tiffin_update / tiffin_menu land here.
 */
export default function TiffinSubscription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t, money, date } = useLocale();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateTiffin();
  const now = useNow();
  const countdown = useCountdownText();
  const detail = useMySubscription(id);
  const upcoming = useUpcoming(id);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [busy, setBusy] = useState<"retry" | "resume" | "pause" | "cancel" | "edit" | null>(null);
  const [pausing, setPausing] = useState(false);
  const [pauseUntil, setPauseUntil] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ address: "", postalCode: "", addressNotes: "", dietaryNotes: "" });
  const [touched, setTouched] = useState(false);
  const pay = usePayment(() => {
    invalidate(id);
    void qc.invalidateQueries({ queryKey: rk.subs });
  });
  const today = torontoToday();

  if (detail.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (!detail.data) return <Screen back title={t("rest.tiffin.mine")}><ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => detail.refetch()} /></Screen>;
  const sub = detail.data.subscription;
  const charges = detail.data.charges;
  const meals = (upcoming.data?.items ?? []).filter((u) => u.subscriptionId === sub.id);
  const act = subscriptionActions(sub, today);
  const per = t(sub.plan.cadence === "weekly" ? "rest.perWeek" : "rest.perMonth");
  const fail = (e: unknown) => setError(isApiError(e) && e.code === "cutoff_passed" ? t("rest.tiffin.cutoffPassed") : errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
  const run = async <T,>(key: NonNullable<typeof busy>, fn: () => Promise<T>, then?: (r: T) => void) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      invalidate(sub.id);
      then?.(r);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const skip = async (day: string) => {
    setBusyDate(day);
    setError(null);
    try {
      const r = await api.tiffin.skip(sub.id, [day]);
      invalidate(sub.id);
      toast({ tone: "success", message: r.creditCents > 0 ? t("rest.tiffin.skipped.credit", { amount: money(r.creditCents) }) : t("rest.tiffin.skipped") });
    } catch (e) {
      fail(e);
    } finally {
      setBusyDate(null);
    }
  };
  const undo = async (day: string) => {
    setBusyDate(day);
    setError(null);
    try {
      await api.tiffin.unskip(sub.id, day);
      invalidate(sub.id);
      toast({ tone: "success", message: t("rest.tiffin.unskipped") });
    } catch (e) {
      fail(e);
    } finally {
      setBusyDate(null);
    }
  };
  const retry = () =>
    run("retry", () => api.tiffin.retryPayment(sub.id), async (r) => {
      if (r.payment) await pay(r.payment);
      else toast({ message: t("rest.tiffin.nothingDue") });
    });
  const openEdit = () => {
    setForm({ address: sub.address ?? "", postalCode: sub.postalCode ?? "", addressNotes: sub.addressNotes ?? "", dietaryNotes: sub.dietaryNotes ?? "" });
    setTouched(false);
    setError(null);
    setEditing(true);
  };
  const delivery = sub.fulfilment === "delivery";
  const formOk = !delivery || (form.address.trim().length >= 3 && isPostalCode(form.postalCode));
  const save = () => {
    setTouched(true);
    if (!formOk) return;
    void run(
      "edit",
      () =>
        api.tiffin.update(sub.id, {
          ...(delivery ? { address: form.address.trim(), postalCode: form.postalCode.trim().toUpperCase() } : {}),
          addressNotes: form.addressNotes.trim() || null,
          dietaryNotes: form.dietaryNotes.trim() || null,
        }),
      () => {
        setEditing(false);
        toast({ tone: "success", message: t("rest.tiffin.saved") });
      },
    );
  };

  return (
    <Screen back title={t("rest.tiffin.mine")} onRefresh={() => Promise.all([detail.refetch(), upcoming.refetch()])} refreshing={detail.isRefetching}>
      <View style={{ gap: 6 }}>
        <Text variant="meta" color="fgMuted">
          {sub.merchant.name}
        </Text>
        <Text style={disp(26, 800, 30, -0.01)} accessibilityRole="header">
          {sub.plan.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <StatusBadge tone={subTone(sub.status)}>{t(`rest.sub.${sub.status}` as const)}</StatusBadge>
          <Text variant="meta" color="fgMuted" style={{ flexShrink: 1 }}>
            {`${money(sub.priceCents)} ${per} · ${t("rest.tiffin.servingsCount", { n: sub.servings })} · ${t(delivery ? "delivery.title" : "delivery.pickup")}`}
          </Text>
        </View>
      </View>

      {sub.status === "past_due" ? (
        <Banner variant="danger" actionLabel={t("rest.tiffin.retry")} onAction={retry} busy={busy === "retry"}>
          {t("rest.tiffin.pastDue")}
        </Banner>
      ) : null}
      {sub.status === "pending" ? (
        <Banner variant="warning" actionLabel={t("rest.tiffin.payNow")} onAction={retry} busy={busy === "retry"}>
          {t("rest.tiffin.pendingPay")}
        </Banner>
      ) : null}
      {sub.status === "paused" || (sub.pausedUntil && sub.pausedUntil > today) ? (
        <Banner variant="neutral" actionLabel={act.canResume ? t("tiffin.resume") : undefined} onAction={() => run("resume", () => api.tiffin.resume(sub.id), () => toast({ tone: "success", message: t("rest.tiffin.resumed") }))} busy={busy === "resume"}>
          {sub.pausedUntil ? t("rest.tiffin.pausedUntil", { date: date(dayToDate(sub.pausedUntil), { weekday: "short", day: "numeric", month: "short" }) }) : t("tiffin.paused")}
        </Banner>
      ) : null}
      {sub.status === "cancelled" ? <Banner variant="neutral">{t("rest.tiffin.cancelledBanner")}</Banner> : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}

      {sub.status !== "cancelled" ? (
        <Section title={t("rest.tiffin.nextMeals")}>
          {upcoming.isLoading ? <SkeletonList rows={3} rowHeight={64} /> : null}
          {!upcoming.isLoading && meals.length === 0 ? <Text color="fgMuted" style={{ paddingTop: 12 }}>{t("rest.tiffin.noMeals")}</Text> : null}
          {meals.map((u, i) => {
            const parts = countdownParts(u.cutoffAt, now);
            const skipOk = canStillSkip(u, now);
            const undoOk = canUndoSkip(u, now);
            const names = u.menu.map((m) => m.name).join(", ");
            return (
              <View key={u.date} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: i < meals.length - 1 ? hairline : 0, borderBottomColor: c.line }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyStrong">{date(dayToDate(u.date), { weekday: "short", day: "numeric", month: "short" })}</Text>
                  <Text variant="meta" color={u.status === "skipped" || u.status === "paused" ? "fgSubtle" : "fgMuted"} numberOfLines={2}>
                    {names || t(deliveryStatusKey(u.status))}
                  </Text>
                  <Text style={ui(12, 500, 16)} color="fgMuted">
                    {u.status === "scheduled" ? (parts.kind === "passed" ? t("rest.tiffin.cutoff.passed") : t("rest.tiffin.cutoff.in", { time: countdown(parts) })) : t(deliveryStatusKey(u.status))}
                  </Text>
                </View>
                {skipOk ? (
                  <Button size="sm" variant="secondary" loading={busyDate === u.date} onPress={() => skip(u.date)} accessibilityLabel={`${t("tiffin.skipDay")}, ${date(dayToDate(u.date), { weekday: "long", day: "numeric", month: "long" })}`}>
                    {t("rest.tiffin.skip")}
                  </Button>
                ) : undoOk ? (
                  <Button size="sm" variant="outline" loading={busyDate === u.date} onPress={() => undo(u.date)} accessibilityLabel={`${t("rest.tiffin.undo")}, ${date(dayToDate(u.date), { weekday: "long", day: "numeric", month: "long" })}`}>
                    {t("rest.tiffin.undo")}
                  </Button>
                ) : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      {act.canEdit || act.canCancel ? (
        <Section title={t("rest.tiffin.manage")}>
          {act.canPause && sub.status === "active" ? (
            <ListRow
              title={t("rest.tiffin.pause")}
              subtitle={t("rest.tiffin.pause.sub")}
              chevron
              onPress={() => {
                setPauseUntil(null);
                setError(null);
                setPausing(true);
              }}
            />
          ) : null}
          {act.canResume && sub.status !== "active" ? <ListRow title={t("tiffin.resume")} chevron onPress={() => run("resume", () => api.tiffin.resume(sub.id), () => toast({ tone: "success", message: t("rest.tiffin.resumed") }))} /> : null}
          {act.canEdit ? <ListRow title={delivery ? t("rest.tiffin.changeAddress") : t("rest.tiffin.changeNotes")} subtitle={delivery ? [sub.address, sub.postalCode].filter(Boolean).join(", ") : undefined} chevron onPress={openEdit} /> : null}
          {act.canRetry && sub.status === "past_due" ? <ListRow title={t("rest.tiffin.retry")} subtitle={t("rest.tiffin.retry.sub")} chevron onPress={retry} /> : null}
          {act.canCancel ? <ListRow title={t("rest.tiffin.cancel")} danger divider={false} onPress={() => setCancelling(true)} /> : null}
        </Section>
      ) : null}

      <Section title={t("rest.tiffin.charges")}>
        {charges.length === 0 ? <Text color="fgMuted" style={{ paddingTop: 12 }}>{t("rest.tiffin.noCharges")}</Text> : null}
        {charges.map((ch, i) => (
          <ListRow
            key={ch.id}
            divider={i < charges.length - 1}
            title={`${date(dayToDate(ch.periodStart), { day: "numeric", month: "short" })} – ${date(dayToDate(ch.periodEnd), { day: "numeric", month: "short" })}`}
            subtitle={ch.creditCents > 0 ? t("rest.tiffin.credit", { amount: money(ch.creditCents) }) : ch.paidAt ? t("rest.tiffin.paidOn", { date: date(ch.paidAt, { day: "numeric", month: "short" }) }) : null}
            trailing={
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text variant="bodyStrong" tabular>
                  {money(ch.amountCents)}
                </Text>
                <StatusBadge tone={CHARGE_TONE[ch.status]}>{t(`rest.charge.${ch.status}` as const)}</StatusBadge>
              </View>
            }
          />
        ))}
      </Section>

      {sub.status !== "cancelled" ? (
        <Card title={t("rest.tiffin.details")}>
          <InfoRow label={t("rest.tiffin.startDate")} value={date(dayToDate(sub.startDate), { weekday: "short", day: "numeric", month: "short", year: "numeric" })} />
          {sub.nextBillingDate ? <InfoRow label={t("rest.tiffin.nextBill")} value={date(dayToDate(sub.nextBillingDate), { day: "numeric", month: "short" })} /> : null}
          {delivery && sub.address ? <InfoRow label={t("delivery.address")} value={[sub.address, sub.postalCode].filter(Boolean).join(", ")} /> : null}
          {sub.dietaryNotes ? <InfoRow label={t("rest.tiffin.dietaryNotes")} value={sub.dietaryNotes} /> : null}
        </Card>
      ) : null}
      {sub.status === "cancelled" && meals.length === 0 && charges.length === 0 ? <EmptyState icon={Ticket} body={t("rest.tiffin.cancelledBanner")} /> : null}

      <Sheet
        visible={pausing}
        onClose={() => setPausing(false)}
        title={t("rest.tiffin.pause")}
        footer={
          <Button
            size="lg"
            fullWidth
            loading={busy === "pause"}
            disabled={!pauseUntil}
            onPress={() =>
              void run("pause", () => api.tiffin.pause(sub.id, { until: pauseUntil! }), (r) => {
                setPausing(false);
                toast({ tone: "success", message: t("rest.tiffin.paused", { from: date(dayToDate(r.pausedFrom), { day: "numeric", month: "short" }), until: date(dayToDate(r.resumesOn), { day: "numeric", month: "short" }) }) });
              })
            }
          >
            {t("rest.tiffin.pause.confirm")}
          </Button>
        }
      >
        <Text color="fgMuted">{t("rest.tiffin.pause.body", { n: sub.plan.cutoffHours })}</Text>
        <DateField label={t("rest.tiffin.resumeOn")} value={pauseUntil} onChange={setPauseUntil} min={addDays(today, 2)} max={addDays(today, 120)} />
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </Sheet>

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={delivery ? t("rest.tiffin.changeAddress") : t("rest.tiffin.changeNotes")}
        footer={
          <Button size="lg" fullWidth loading={busy === "edit"} onPress={save}>
            {t("rest.save")}
          </Button>
        }
      >
        {delivery ? (
          <>
            <TextField label={t("delivery.address")} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} maxLength={300} error={touched && form.address.trim().length < 3 ? t("rest.err.address") : null} />
            <TextField
              label={t("rest.tiffin.postal")}
              value={form.postalCode}
              onChangeText={(v) => setForm((f) => ({ ...f, postalCode: normalizePostalCode(v) }))}
              autoCapitalize="characters"
              placeholder="L4T 1A1"
              maxLength={7}
              hint={t("rest.tiffin.postalChangeHint")}
              error={touched && !isPostalCode(form.postalCode) ? t("rest.err.postal") : null}
            />
            <TextField label={t("rest.tiffin.addressNotes")} optionalLabel value={form.addressNotes} onChangeText={(v) => setForm((f) => ({ ...f, addressNotes: v }))} maxLength={500} />
          </>
        ) : null}
        <TextField label={t("rest.tiffin.dietaryNotes")} optionalLabel value={form.dietaryNotes} onChangeText={(v) => setForm((f) => ({ ...f, dietaryNotes: v }))} maxLength={500} />
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </Sheet>

      <ConfirmDialog
        visible={cancelling}
        title={t("rest.tiffin.cancel.title")}
        body={t("rest.tiffin.cancel.body")}
        confirmLabel={t("rest.tiffin.cancel")}
        cancelLabel={t("rest.tiffin.cancel.keep")}
        loading={busy === "cancel"}
        onCancel={() => setCancelling(false)}
        onConfirm={() =>
          void run("cancel", () => api.tiffin.cancel(sub.id), () => {
            setCancelling(false);
            toast({ message: t("rest.tiffin.cancelled") });
          })
        }
      />
    </Screen>
  );
}
