import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, View } from "react-native";
import { useWallet } from "../features/customer/queries";
import { formatPts } from "../lib/award";
import { api } from "../state/api";
import { qk } from "../state/query";
import { Badge, Button, Card, Chip, EmptyState, Screen, Share2, SkeletonList, Text, UserPlus } from "../ui";

/** Invite a friend: single-use referral code per shop, shared with the OS share sheet. */
export default function Referrals() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const wallet = useWallet();
  const qc = useQueryClient();
  const shops = (wallet.data?.items ?? []).filter((m) => (m.program?.referralBonus ?? 0) > 0);
  const [memberId, setMemberId] = useState<string | null>(params.memberId ?? null);
  const selected = shops.find((m) => m.id === memberId) ?? shops[0] ?? null;
  const ref = useQuery({ queryKey: qk.referral(selected?.id ?? "none"), queryFn: () => api.me.referral(selected!.id), enabled: !!selected });

  if (!wallet.isLoading && shops.length === 0) {
    return (
      <Screen back title="Invite a friend">
        <EmptyState icon={UserPlus} title="No referral rewards yet" body="When a shop you've joined offers a referral bonus, you can invite friends here." />
      </Screen>
    );
  }
  return (
    <Screen back title="Invite a friend">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {shops.map((m) => (
          <Chip key={m.id} label={m.merchant.name} selected={selected?.id === m.id} onPress={() => setMemberId(m.id)} />
        ))}
      </View>
      {ref.isLoading || !ref.data ? (
        <SkeletonList rows={1} rowHeight={180} />
      ) : (
        <Card>
          <Text variant="title">{selected?.merchant.name}</Text>
          <Text color="fgMuted">
            {ref.data.bonusPoints > 0 ? `You and your friend each get ${formatPts(ref.data.bonusPoints, selected?.terminology)} when they join.` : "Invite a friend to join."}
          </Text>
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Text variant="code" selectable>
              {ref.data.code}
            </Text>
            <Text variant="caption" color="fgMuted">
              Each code works for one friend.
            </Text>
          </View>
          <Button iconStart={Share2} fullWidth onPress={() => Share.share({ message: `${ref.data!.shareText} ${ref.data!.shareUrl}`, url: ref.data!.shareUrl })}>
            Share invite
          </Button>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
            <Badge tone="neutral">{`${ref.data.stats.invited} invited`}</Badge>
            <Badge tone="success">{`${ref.data.stats.rewarded} rewarded`}</Badge>
            <View style={{ flex: 1 }} />
            <Button
              variant="ghost"
              size="sm"
              onPress={async () => {
                const fresh = await api.me.newReferral(selected!.id);
                qc.setQueryData(qk.referral(selected!.id), fresh);
              }}
            >
              New code
            </Button>
          </View>
        </Card>
      )}
    </Screen>
  );
}
