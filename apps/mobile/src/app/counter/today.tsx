import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatMoney, shortName } from "../../lib/award";
import { formatTime } from "../../lib/format";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { qk } from "../../state/query";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Gift, History, ListRow, Plus, Screen, Section, SkeletonList, StatTile, Text, useToast } from "../../ui";
import { last4 } from "../../lib/phone";

/** Today: 2x2 stats + today's activity with the staff initials; Undo where the API allows it. */
export default function Today() {
  const { config, online } = useCounter();
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
        <SkeletonList rows={2} rowHeight={96} />
      ) : today.data ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile label="Visits" value={today.data.visitCount} />
            <StatTile label="Points given" value={today.data.pointsIssued} />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile label="Redemptions" value={today.data.redemptions} />
            <StatTile label="New members" value={today.data.newMembers} />
          </View>
        </View>
      ) : (
        <ErrorState offline={!online} message={t("err.network")} onRetry={() => today.refetch()} />
      )}
      <Section title="Activity">
        {(activity.data?.items ?? []).length === 0 && !activity.isLoading ? (
          <EmptyState icon={History} title="No visits yet today" body="Awards show up here as you make them." />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {(activity.data?.items ?? []).map((a, i, all) => (
              <ListRow
                key={a.transactionId}
                divider={i < all.length - 1}
                minHeight={64}
                // Staff initials when we know who tapped (staff-counter.md § 8); otherwise the kind of entry.
                leading={a.staffName ? <Avatar name={a.staffName} id={a.staffUserId ?? undefined} size={40} /> : undefined}
                leadingIcon={a.staffName ? undefined : a.points < 0 ? Gift : Plus}
                title={shortName(a.name)}
                subtitle={[formatTime(a.createdAt), a.maskedPhone ? `...${last4(a.maskedPhone)}` : null, a.amountCents ? formatMoney(a.amountCents) : null, a.points < 0 ? "Redeemed" : null].filter(Boolean).join(" · ")}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text variant="bodyStrong" tabular color={a.reversed ? "fgMuted" : a.points > 0 ? "onSuccessSubtle" : "fg"} style={a.reversed ? { textDecorationLine: "line-through" } : null}>
                      {`${a.points > 0 ? "+" : ""}${a.points}`}
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
          </Card>
        )}
      </Section>
      <Text variant="bodySm" color="fgMuted">Later corrections go through Adjust in the dashboard.</Text>
    </Screen>
  );
}
