import type { customerApi } from "@ll/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { t } from "../../copy/en-CA";
import { useWallet } from "../../features/customer/queries";
import { activityTitle, groupByDay } from "../../lib/activity";
import { formatMoney } from "../../lib/award";
import { formatDate, formatTime } from "../../lib/format";
import { api } from "../../state/api";
import { Button, Chip, EmptyState, History, ListRow, Screen, Section, Sheet, ShopLogo, SkeletonList, Text } from "../../ui";

type Row = customerApi.LedgerTxDto & { membership: customerApi.MembershipDto };

/** 7. Activity: grouped by day, filter chips by shop, detail sheet with the transaction id. */
export default function Activity() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const wallet = useWallet();
  const memberships = wallet.data?.items ?? [];
  const [shop, setShop] = useState<string | null>(params.memberId ?? null);
  const [open, setOpen] = useState<Row | null>(null);
  const targets = shop ? memberships.filter((m) => m.id === shop) : memberships;

  const q = useInfiniteQuery({
    queryKey: ["activity", targets.map((m) => m.id).join(",")],
    enabled: targets.length > 0,
    initialPageParam: {} as Record<string, string | null>,
    queryFn: async ({ pageParam }) => {
      const results = await Promise.all(
        targets
          .filter((m) => pageParam[m.id] !== null)
          .map(async (m) => {
            const d = await api.me.membership(m.id, 30, pageParam[m.id] ?? undefined);
            return { m, d };
          }),
      );
      const cursors: Record<string, string | null> = { ...pageParam };
      const rows: Row[] = [];
      for (const { m, d } of results) {
        cursors[m.id] = d.history.nextCursor;
        rows.push(...d.history.items.map((tx) => ({ ...tx, membership: m })));
      }
      return { rows, cursors };
    },
    getNextPageParam: (last) => (Object.values(last.cursors).some((c) => c) ? last.cursors : undefined),
  });
  const rows = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.rows), [q.data]);
  const groups = groupByDay(rows);

  return (
    <Screen back={!!params.memberId} title="Activity" largeTitle={!params.memberId} tabBar={!params.memberId}>
      {memberships.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label="All shops" selected={!shop} onPress={() => setShop(null)} />
          {memberships.map((m) => (
            <Chip key={m.id} label={m.merchant.name} selected={shop === m.id} onPress={() => setShop(m.id)} />
          ))}
        </ScrollView>
      ) : null}
      {q.isLoading || wallet.isLoading ? (
        <SkeletonList rows={5} rowHeight={56} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title={t("empty.activity.title")} body={t("empty.activity.body", { terminology: "points" })} actionLabel={t("empty.activity.action")} onAction={() => router.push("/map")} />
      ) : (
        groups.map((g) => (
          <Section key={g.label} title={g.label}>
            <View>
              {g.items.map((tx, i) => (
                <ListRow
                  key={tx.id}
                  divider={i < g.items.length - 1}
                  leading={<ShopLogo shop={tx.membership.merchant} size={44} />}
                  title={activityTitle(tx, tx.membership.terminology, tx.membership.merchant.name)}
                  subtitle={[tx.membership.merchant.name, formatTime(tx.createdAt), tx.amountCents ? formatMoney(tx.amountCents) : null].filter(Boolean).join(" · ")}
                  trailing={
                    <Text variant="headline" color={tx.reversed ? "fgSubtle" : tx.points > 0 ? "accentText" : "fgMuted"} tabular style={tx.reversed ? { textDecorationLine: "line-through" } : null}>
                      {`${tx.points > 0 ? "+" : ""}${tx.points}`}
                    </Text>
                  }
                  onPress={() => setOpen(tx)}
                />
              ))}
            </View>
          </Section>
        ))
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()}>
          Show more
        </Button>
      ) : null}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open ? activityTitle(open, open.membership.terminology, open.membership.merchant.name) : ""}>
        {open ? (
          <View style={{ gap: 8 }}>
            <Text>{`${open.membership.merchant.name} · ${formatDate(open.createdAt)} ${formatTime(open.createdAt)}`}</Text>
            {open.amountCents ? <Text>{`Purchase ${formatMoney(open.amountCents)}`}</Text> : null}
            {open.breakdown.map((b) => (
              <Text key={b} variant="meta" color="fgMuted">
                {b}
              </Text>
            ))}
            {open.reversed ? <Text color="fgMuted">This transaction was reversed.</Text> : null}
            <Text variant="caption" color="fgMuted" selectable>{`Transaction ${open.id}`}</Text>
            <Text variant="meta" color="fgMuted">{`Something wrong? Contact ${open.membership.merchant.name}.`}</Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
