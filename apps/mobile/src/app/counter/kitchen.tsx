import type { restaurantApi } from "@ll/shared";
import { translator, type MessageKey } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { isApiError } from "../../api/client";
import { KitchenTicket } from "../../features/counter/kitchen";
import { KITCHEN_POLL_MS, groupTickets, isLate, liveAgeSeconds, nextItemStatus, withItemStatus, type KitchenColumn } from "../../lib/kitchen";
import { LanguageSwitcher } from "../../lib/i18n/LanguageSwitcher";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { Banner, Button, Chip, EmptyState, RotateCcw, Screen, SegmentedControl, Skeleton, Text, UtensilsCrossed, useToast } from "../../ui";

type Ticket = restaurantApi.KitchenTicketDto;
type Data = restaurantApi.KitchenTicketsResponse;

/**
 * Kitchen display for staff with restaurant.kds: station picker, tickets by state, tap an item to move it
 * queued -> cooking -> ready, Bump when the ticket is done. Polls every 5 s, text in the staff member's language.
 */
export default function Kitchen() {
  const { config } = useCounter();
  const session = useSession();
  const { t, locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const mId = config.merchantId ?? "";
  const own = session.merchants.find((m) => m.merchantId === mId);
  const [station, setStation] = useState<string>(own?.station ?? "all");
  const [column, setColumn] = useState<KitchenColumn>("new");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<{ orderId: string; number: number }[]>([]);
  const key = ["kitchen", mId, station, locale] as const;

  const q = useQuery({
    queryKey: key,
    queryFn: () => api.kitchen.tickets(mId, { station, lang: locale }),
    enabled: !!mId,
    refetchInterval: KITCHEN_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tickets = useMemo(() => q.data?.items ?? [], [q.data]);
  const groups = useMemo(() => groupTickets(tickets), [tickets]);
  const tr = useMemo(() => translator(locale), [locale]);
  const stations = q.data?.stations ?? [];
  const stationWord = (s: string) => {
    const k = `station.${s}` as MessageKey;
    const w = tr(k);
    return w === k ? s.replace(/^./, (x) => x.toUpperCase()) : w;
  };
  const age = (tk: Ticket) => liveAgeSeconds(tk.ageSeconds, q.dataUpdatedAt || now, now);

  const mark = async (id: string, fn: () => Promise<unknown>) => {
    setBusy((b) => new Set(b).add(id));
    try {
      await fn();
    } catch (e) {
      toast({ tone: "error", message: isApiError(e) ? e.message : t("kitchen.noTickets") });
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(id);
        return n;
      });
      await q.refetch();
    }
  };
  const onItem = (item: restaurantApi.KitchenItemDto) => {
    const next = nextItemStatus(item.status);
    if (!next) return;
    qc.setQueryData<Data>(key, (d) => (d ? { ...d, items: withItemStatus(d.items, item.id, next) } : d));
    void mark(item.id, () => api.kitchen.setItem(mId, item.id, next));
  };
  const onBump = (tk: Ticket) => {
    qc.setQueryData<Data>(key, (d) => (d ? { ...d, items: d.items.filter((x) => x.orderId !== tk.orderId) } : d));
    setRecent((r) => [{ orderId: tk.orderId, number: tk.number }, ...r.filter((x) => x.orderId !== tk.orderId)].slice(0, 4));
    void mark(tk.orderId, () => api.kitchen.bump(mId, tk.orderId));
  };
  const onRecall = (r: { orderId: string }) => {
    setRecent((x) => x.filter((y) => y.orderId !== r.orderId));
    void mark(r.orderId, () => api.kitchen.recall(mId, r.orderId));
  };

  const late = tickets.filter((x) => isLate(age(x))).length;
  const labels: Record<KitchenColumn, string> = { new: t("kitchen.new"), cooking: t("kitchen.cooking"), ready: t("kitchen.ready") };
  const list = (items: Ticket[]) =>
    items.map((tk) => <KitchenTicket key={tk.orderId} ticket={tk} age={age(tk)} busy={busy.has(tk.orderId) || tk.items.some((i) => busy.has(i.id))} onItem={onItem} onBump={() => onBump(tk)} />);

  return (
    <Screen back title="Kitchen" subtitle={`${tickets.length} · ${t("kitchen.late")} ${late}`} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <LanguageSwitcher />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stations} accessibilityLabel={t("kitchen.station")}>
        {["all", ...stations].map((s) => (
          <Chip key={s} large label={s === "all" ? t("kitchen.all") : stationWord(s)} selected={station === s} onPress={() => setStation(s)} />
        ))}
      </ScrollView>
      {q.error && !q.data ? (
        <Banner variant="danger" actionLabel="Try again" onAction={() => void q.refetch()}>
          {isApiError(q.error) && q.error.status === 402 ? "The kitchen display comes with Restaurant Pro." : isApiError(q.error) ? q.error.message : "Can't load tickets."}
        </Banner>
      ) : !q.data ? (
        <Skeleton height={220} radius={16} />
      ) : !tickets.length ? (
        <EmptyState icon={UtensilsCrossed} body={t("kitchen.noTickets")} />
      ) : wide ? (
        <View style={styles.cols}>
          {(["new", "cooking", "ready"] as const).map((c) => (
            <View key={c} style={styles.col}>
              <Text variant="metaStrong" color="fgMuted">
                {labels[c].toUpperCase()} {groups[c].length}
              </Text>
              {list(groups[c])}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <SegmentedControl accessibilityLabel={t("kitchen.station")} value={column} onChange={setColumn} options={(["new", "cooking", "ready"] as const).map((c) => ({ value: c, label: `${labels[c]} ${groups[c].length}` }))} />
          {groups[column].length ? list(groups[column]) : <Text variant="meta" color="fgMuted">{t("kitchen.noTickets")}</Text>}
        </View>
      )}
      {recent.length ? (
        <View style={styles.recent}>
          <Text variant="meta" color="fgMuted">
            {t("kitchen.justBumped")}
          </Text>
          {recent.map((r) => (
            <Button key={r.orderId} size="md" variant="outline" iconStart={RotateCcw} onPress={() => onRecall(r)}>
              {t("kitchen.recall", { n: r.number })}
            </Button>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stations: { gap: 8, paddingVertical: 2 },
  cols: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  col: { flex: 1, gap: 12 },
  recent: { gap: 8, alignItems: "flex-start" },
});
