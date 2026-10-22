import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, ErrorState, QuoteApproval, Screen, SkeletonList, Text, useToast } from "../../ui";

/** Quote approval opened from an SMS/push link (ll://quote/<token> or /q/<token>). */
export default function QuoteByToken() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useSession();
  const toast = useToast();
  const q = useQuery({ queryKey: ["publicQuote", token], queryFn: () => api.service.publicQuote(token!), enabled: !!token });
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (q.isLoading) return <Screen back><SkeletonList rows={3} /></Screen>;
  if (!q.data) return <Screen back><ErrorState message="This link doesn't work anymore. Contact the shop." /></Screen>;
  const { merchant, ticket, quote } = q.data;
  const title = [ticket.itemDetails.make, ticket.itemDetails.model].filter(Boolean).join(" ") || ticket.issue;
  const respond = async (kind: "approve" | "decline", name?: string) => {
    setBusy(kind);
    setError(null);
    try {
      const res = kind === "approve" ? await api.service.publicApproveQuote(token!, name!) : await api.service.publicDeclineQuote(token!);
      if (kind === "approve") toast({ tone: "success", message: t("ok.quoteApproved", { shop: merchant.name }) });
      if (res.deposit && quote.approvalUrl) await Linking.openURL(quote.approvalUrl);
      await q.refetch();
    } catch (e) {
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen back title={merchant.name}>
      <Text color="fgMuted">{ticket.issue}</Text>
      <QuoteApproval
        quote={q.data.expired ? { ...quote, status: "expired" } : quote}
        title={title}
        ticketNumber={ticket.number}
        shopName={merchant.name}
        shopPhone={merchant.phone}
        defaultName={user?.name}
        busy={busy}
        error={error}
        onApprove={(name) => respond("approve", name)}
        onDecline={() => respond("decline")}
      />
      {!q.data.canRespond && quote.status === "sent" ? <Banner variant="neutral">This quote can't be changed any more.</Banner> : null}
    </Screen>
  );
}
