import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatMoney, shortName } from "../../lib/award";
import { formatTime, signed } from "../../lib/format";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { qk } from "../../state/query";
import { Avatar, Badge, Button, EmptyState, ErrorState, History, ListRow, Screen, Section, Skeleton, StatTile, Text, useToast } from "../../ui";
import { last4Label } from "../../lib/phone";

/** Today: 2x2 stats + today's activity with the staff initials; Undo where the API allows it. */
export default function Today() {
  const { c } = useTheme();
  const { config, online, program } = useCounter();
  const unit = (program?.terminology ?? "points").toLowerCase();
  const toast = useToast();
  const mId = config.merchantId ?? "";
  const loc = config.locationId ?? undefined;
  const today = useQuery({ queryKey: qk.counterToday(mId, loc), queryFn: () => api.counter.today(mId, loc), enabled: !!mId });
  const activity = useQuery({ queryKey: qk.counterActivity(mId, loc), queryFn: () => api.counter.activity(mId, loc, 100), enabled: !!mId });
  const [busy, setBusy] = useState<string | null>(null);
  const undo = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.counter.undo(mId, id, "Undo from Today");
      toast(t("ok.counter.undone", { firstName: shortName(res.member.name), pts: `${res.member.balance} ${res.member.terminology}` }));
      await Promise.all([today.refetch(), activity.refetch()]);
    } catch (e) {
      toast({ tone: "error", message: isApiError(e) && e.status === 403 ? "Ask a manager to undo this one." : isApiError(e) ? e.message : t("err.network") });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen back title="Today" onRefresh={() => Promise.all([today.refetch(), activity.refetch()])} refreshing={today.isRefetching}>
      {today.isLoading ? (
        <Skeleton height={176} radius={16} />
      ) : today.data ? (
        // One bordered block, numbers split by hairlines (foundations § Stats), not four cards.
        <View style={[styles.stats, { borderColor: c.line }]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <StatTile label="Visits" value={today.data.visitCount} />
            </View>
            <View style={[styles.vrule, { backgroundColor: c.line }]} />
            <View style={styles.stat}>
              <StatTile label={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} given`} value={today.data.pointsIssued} />
            </View>
          </View>
          <View style={[styles.hrule, { backgroundColor: c.line }]} />
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <StatTile label="Redemptions" value={today.data.redemptions} />
            </View>
            <View style={[styles.vrule, { backgroundColor: c.line }]} />
            <View style={styles.stat}>
              <StatTile label="New members" value={today.data.newMembers} />
            </View>
          </View>
        </View>
      ) : (
        <ErrorState offline={!online} message={t("err.network")} onRetry={() => today.refetch()} />
      )}
      <Section title="Activity">
        {(activity.data?.items ?? []).length === 0 && !activity.isLoading ? (
          <EmptyState icon={History} body="No visits yet today. Awards show up here as you make them." />
        ) : (
          <View>
            {(activity.data?.items ?? []).map((a, i, all) => (
              <ListRow
                key={a.transactionId}
                divider={i < all.length - 1}
                minHeight={64}
                // The row is about the customer: their initials lead; who tapped goes in the meta line (polish-audit C13).
                leading={<Avatar name={a.name} size={40} />}
                title={shortName(a.name)}
                subtitle={[formatTime(a.createdAt), a.maskedPhone ? last4Label(a.maskedPhone) : null, a.amountCents ? formatMoney(a.amountCents) : null, a.points < 0 ? "redeemed" : null, a.staffName ? `by ${a.staffName.split(" ")[0]}` : null].filter(Boolean).join(" · ")}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text variant="bodyStrong" tabular color={a.reversed ? "fgMuted" : a.points > 0 ? "accentText" : "fg"} style={a.reversed ? { textDecorationLine: "line-through" } : null}>
                      {signed(a.points)}
                    </Text>
                    {a.reversed ? (
                      <Badge>Undone</Badge>
                    ) : a.canUndo ? (
                      <Button variant="secondary" size="sm" loading={busy === a.transactionId} onPress={() => undo(a.transactionId)}>
                        Undo
                      </Button>
                    ) : null}
                  </View>
                }
              />
            ))}
          </View>
        )}
      </Section>
      <Text variant="meta" color="fgMuted">Later corrections go through Adjust in the dashboard.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 16, overflow: "hidden" },
  statRow: { flexDirection: "row" },
  stat: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  vrule: { width: StyleSheet.hairlineWidth * 2 },
  hrule: { height: StyleSheet.hairlineWidth * 2 },
});
