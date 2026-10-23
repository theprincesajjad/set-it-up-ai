import type { MessageKey, serviceApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatMoney, formatPts } from "../../lib/award";
import { formatDate } from "../../lib/format";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { disp } from "../../theme";
import { useSession } from "../../state/session";
import { Badge, Banner, Button, Card, ErrorState, QuoteApproval, Screen, Section, SkeletonList, Text, TICKET_STATUS_LABELS, Timeline, useToast } from "../../ui";

function ticketTitle(ticket: serviceApi.TicketDto): string {
  const d = ticket.itemDetails;
  return [d.make, d.model].filter(Boolean).join(" ") || ticket.issue;
}

/** Ticket detail: timeline, inline quote approval (typed signature), invoice card. */
export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  const { t: tr } = useLocale();
  const q = useQuery({ queryKey: qk.ticket(id ?? ""), queryFn: () => api.service.ticket(id!), enabled: !!id, refetchInterval: 30_000 });
  const [busy, setBusy] = useState<"approve" | "decline" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<serviceApi.DepositPaymentDto | null>(null);

  if (q.isLoading) return <Screen back><SkeletonList rows={4} /></Screen>;
  if (!q.data) return <Screen back><ErrorState message="We couldn't find this repair." onRetry={() => q.refetch()} /></Screen>;
  const { ticket, events, quotes, invoices } = q.data;
  const quote = [...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const invoice = invoices.find((i) => i.status === "open") ?? invoices.find((i) => i.status === "paid") ?? null;
  const title = ticketTitle(ticket);

  const respond = async (kind: "approve" | "decline", signature?: string) => {
    if (!quote) return;
    setBusy(kind);
    setError(null);
    try {
      const res = kind === "approve" ? await api.service.approveQuote(quote.id, signature!) : await api.service.declineQuote(quote.id);
      if (kind === "approve") {
        toast({ tone: "success", message: t("ok.quoteApproved", { shop: ticket.merchantName }) });
        setDeposit(res.deposit);
      }
      await q.refetch();
      void qc.invalidateQueries({ queryKey: qk.tickets });
    } catch (e) {
      setError(isApiError(e) && e.code === "quote_expired" ? t("err.quote.expired", { date: quote.expiresAt ? formatDate(quote.expiresAt) : "", shop: ticket.merchantName }) : errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    if (!invoice) return;
    // Card payment runs on the web pay page (Stripe Payment Element) until the app ships the Stripe SDK.
    if (invoice.payUrl) {
      await Linking.openURL(invoice.payUrl);
      return;
    }
    setBusy("pay");
    try {
      const res = await api.service.payInvoice(invoice.id);
      if (res.invoice.payUrl) await Linking.openURL(res.invoice.payUrl);
    } catch (e) {
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen back title={`Ticket #${ticket.number}`} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" color="fgMuted">{tr("sv.t.kicker", { shop: ticket.merchantName, n: ticket.number })}</Text>
        {/* One big status word: is it ready? */}
        <Text style={disp(34, 800, 38)} accessibilityRole="header">{tr(`sv.step.${ticket.status}` as MessageKey)}</Text>
        <Text color="fgMuted">{`${title}, ${ticket.issue}.`}</Text>
        <Text variant="caption" color="fgMuted">{`Dropped off ${formatDate(ticket.createdAt)}`}</Text>
        {ticket.status === "quote_sent" ? <Badge tone="warning">{TICKET_STATUS_LABELS.quote_sent ?? "Needs approval"}</Badge> : null}
      </View>
      {deposit && quote?.approvalUrl ? (
        <Banner variant="warning" actionLabel="Pay deposit" onAction={() => Linking.openURL(quote.approvalUrl!)}>
          {`Deposit of ${formatMoney(deposit.amountCents)} is due.`}
        </Banner>
      ) : null}
      <Timeline
        status={ticket.status}
        events={events}
        quoteSlot={
          quote ? (
            <QuoteApproval
              quote={quote}
              title={title}
              ticketNumber={ticket.number}
              shopName={ticket.merchantName}
              defaultName={user?.name}
              busy={busy === "approve" || busy === "decline" ? busy : null}
              error={error}
              onApprove={(name) => respond("approve", name)}
              onDecline={() => respond("decline")}
            />
          ) : null
        }
      />
      {quote && ticket.status !== "quote_sent" ? (
        <Section title="Quote">
          <QuoteApproval quote={quote} title={title} ticketNumber={ticket.number} shopName={ticket.merchantName} onApprove={() => undefined} onDecline={() => undefined} />
        </Section>
      ) : null}
      {invoice ? (
        <Card title={`Invoice #${invoice.number}`}>
          <Text variant="h3" tabular>
            {formatMoney(invoice.amountDueCents)}
          </Text>
          {invoice.depositAppliedCents > 0 ? <Text variant="bodySm" color="fgMuted">{`Deposit applied: ${formatMoney(invoice.depositAppliedCents)}`}</Text> : null}
          {invoice.status === "paid" ? (
            <Banner variant="success">{invoice.pointsEarned > 0 ? `Paid. You earned ${formatPts(invoice.pointsEarned, "points")}.` : "Paid."}</Banner>
          ) : (
            <>
              <Text variant="bodySm" color="fgMuted">{`You'll earn points at ${ticket.merchantName} when you pay.`}</Text>
              <Button fullWidth loading={busy === "pay"} onPress={pay} style={{ marginTop: 8 }}>
                {`Pay ${formatMoney(invoice.amountDueCents)}`}
              </Button>
            </>
          )}
        </Card>
      ) : null}
      {error && ticket.status !== "quote_sent" ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}
