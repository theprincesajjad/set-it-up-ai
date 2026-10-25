import type { MessageKey, serviceApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { formatDateL, formatMoneyL, formatPtsL } from "../../lib/formatL";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { disp } from "../../theme";
import { useSession } from "../../state/session";
import { Badge, Banner, Button, Card, ErrorState, QuoteApproval, Screen, Section, SkeletonList, Text, TICKET_STATUS_KEYS, Timeline, useToast } from "../../ui";

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
  const L = useLocale();
  const { t: tr } = L;
  const formatMoney = (c: number) => formatMoneyL(L, c);
  const q = useQuery({ queryKey: qk.ticket(id ?? ""), queryFn: () => api.service.ticket(id!), enabled: !!id, refetchInterval: 30_000 });
  const [busy, setBusy] = useState<"approve" | "decline" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<serviceApi.DepositPaymentDto | null>(null);

  if (q.isLoading) return <Screen back><SkeletonList rows={4} /></Screen>;
  if (!q.data) return <Screen back><ErrorState message={tr("ms.ticket.notFound")} onRetry={() => q.refetch()} /></Screen>;
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
        toast({ tone: "success", message: tr("cp.ok.quoteApproved", { shop: ticket.merchantName }) });
        setDeposit(res.deposit);
      }
      await q.refetch();
      void qc.invalidateQueries({ queryKey: qk.tickets });
    } catch (e) {
      setError(isApiError(e) && e.code === "quote_expired" ? tr("sv.q.expired", { date: quote.expiresAt ? formatDateL(L, quote.expiresAt) : "", shop: ticket.merchantName }) : errorMessage(e, { network: tr("auth.err.network"), server: tr("auth.err.server") }));
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
      setError(errorMessage(e, { network: tr("auth.err.network"), server: tr("auth.err.server") }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen back title={tr("ms.ticket.title", { n: ticket.number })} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" color="fgMuted">{tr("sv.t.kicker", { shop: ticket.merchantName, n: ticket.number })}</Text>
        {/* One big status word: is it ready? */}
        <Text style={disp(34, 800, 38)} accessibilityRole="header">{tr(`sv.step.${ticket.status}` as MessageKey)}</Text>
        <Text color="fgMuted">{`${title}, ${ticket.issue}.`}</Text>
        <Text variant="caption" color="fgMuted">{tr("ms.ticket.droppedOff", { date: formatDateL(L, ticket.createdAt) })}</Text>
        {ticket.status === "quote_sent" ? <Badge tone="warning">{tr("ms.needsApproval")}</Badge> : null}
      </View>
      {deposit && quote?.approvalUrl ? (
        <Banner variant="warning" actionLabel={tr("ms.ticket.payDeposit")} onAction={() => Linking.openURL(quote.approvalUrl!)}>
          {tr("ms.ticket.depositDue", { amount: formatMoney(deposit.amountCents) })}
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
        <Section title={tr("ms.ticket.quote")}>
          <QuoteApproval quote={quote} title={title} ticketNumber={ticket.number} shopName={ticket.merchantName} onApprove={() => undefined} onDecline={() => undefined} />
        </Section>
      ) : null}
      {invoice ? (
        <Card title={tr("ms.ticket.invoice", { n: invoice.number })}>
          <Text variant="h3" tabular>
            {formatMoney(invoice.amountDueCents)}
          </Text>
          {invoice.depositAppliedCents > 0 ? <Text variant="bodySm" color="fgMuted">{tr("ms.ticket.depositApplied", { amount: formatMoney(invoice.depositAppliedCents) })}</Text> : null}
          {invoice.status === "paid" ? (
            <Banner variant="success">{invoice.pointsEarned > 0 ? tr("ms.ticket.paidEarned", { amount: formatPtsL(L, invoice.pointsEarned, "points") }) : tr("ms.ticket.paid")}</Banner>
          ) : (
            <>
              <Text variant="bodySm" color="fgMuted">{tr("ms.ticket.willEarn", { shop: ticket.merchantName })}</Text>
              <Button fullWidth loading={busy === "pay"} onPress={pay} style={{ marginTop: 8 }}>
                {tr("ms.ticket.pay", { amount: formatMoney(invoice.amountDueCents) })}
              </Button>
            </>
          )}
        </Card>
      ) : null}
      {error && ticket.status !== "quote_sent" ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}
