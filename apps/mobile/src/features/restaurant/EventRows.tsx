import type { restaurantApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "../../api/client";
import { t as copy } from "../../copy/en-CA";
import { useLocale } from "../../lib/i18n";
import { bookingNeedsDeposit, holdLeft } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useTheme } from "../../theme";
import { Banner, Button, ConfirmDialog, hairline, ListRow, Text, useToast } from "../../ui";
import { StatusBadge, useCountdownText, useMoney, useNow, usePayment, type Tone } from "./components";
import { rk } from "./queries";

export const EVENT_TONE: Record<restaurantApi.CateringStatus, Tone> = { inquiry: "neutral", tasting: "info", quoted: "warning", confirmed: "success", completed: "neutral", cancelled: "neutral" };
export const BOOKING_TONE: Record<restaurantApi.HallBookingStatus, Tone> = { hold: "warning", confirmed: "success", completed: "neutral", cancelled: "neutral" };

/** One hall booking: when, the hold countdown, and Pay deposit / Cancel hold. */
export function BookingRow({ booking, shop, last }: { booking: restaurantApi.HallBookingDto; shop?: string; last: boolean }) {
  const { c } = useTheme();
  const { t, date, time } = useLocale();
  const money = useMoney();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const countdown = useCountdownText();
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: rk.bookings });
  const pay = usePayment(refresh);
  const left = holdLeft(booking, now);
  const lapsed = left?.kind === "passed";
  const needsDeposit = bookingNeedsDeposit(booking, now);
  const status = lapsed ? "cancelled" : booking.status;

  const payDeposit = async () => {
    setBusy("pay");
    setError(null);
    try {
      const { deposit } = await api.banquet.booking(booking.id);
      if (deposit?.clientSecret) await pay(deposit);
      else toast({ message: t("rest.bk.payAtShop") });
    } catch (e) {
      setError(errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.banquet.cancel(booking.id);
      refresh();
      setConfirm(false);
      toast({ message: t("rest.bk.cancelled") });
    } catch (e) {
      setError(errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
      setConfirm(false);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View>
      <ListRow
        strong
        divider={false}
        title={booking.hallName ?? t("rest.bk.hall")}
        subtitle={[shop, `${date(booking.startsAt, { weekday: "short", day: "numeric", month: "short" })}, ${time(booking.startsAt)} – ${time(booking.endsAt)}`, t("rest.guests", { n: booking.headcount })].filter(Boolean).join(" · ")}
        trailing={<StatusBadge tone={BOOKING_TONE[status]}>{t(`rest.bk.status.${status}` as const)}</StatusBadge>}
      />
      <View style={{ paddingBottom: 14, gap: 10 }}>
        {booking.status === "hold" && left && !lapsed ? (
          <Text variant="meta" color="fgMuted">
            {t("rest.bk.holdEnds", { time: countdown(left) })}
            {booking.depositCents > 0 ? ` · ${t("rest.bk.depositDue", { amount: money(booking.depositCents) })}` : ""}
          </Text>
        ) : null}
        {lapsed ? <Text variant="meta" color="fgMuted">{t("rest.bk.holdLapsed")}</Text> : null}
        {booking.status === "confirmed" ? (
          <Text variant="meta" color="fgMuted">
            {booking.depositPaidAt ? t("rest.bk.depositPaid", { amount: money(booking.depositCents) }) : t("rest.bk.depositDue", { amount: money(booking.depositCents) })}
          </Text>
        ) : null}
        {error ? <Banner variant="danger">{error}</Banner> : null}
        {booking.status === "hold" && !lapsed ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {needsDeposit ? (
              <Button size="sm" loading={busy === "pay"} onPress={payDeposit}>
                {t("rest.bk.payDeposit", { amount: money(booking.depositCents) })}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onPress={() => setConfirm(true)}>
              {t("rest.bk.cancelHold")}
            </Button>
          </View>
        ) : null}
      </View>
      <ConfirmDialog visible={confirm} title={t("rest.bk.cancelHold")} body={t("rest.bk.cancel.body")} confirmLabel={t("rest.bk.cancelHold")} cancelLabel={t("rest.bk.keep")} loading={busy === "cancel"} onCancel={() => setConfirm(false)} onConfirm={cancel} />
      {last ? null : <View style={{ height: hairline, backgroundColor: c.line }} />}
    </View>
  );
}
