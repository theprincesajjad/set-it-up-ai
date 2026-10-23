"use client";
import { MessageCircle, Star } from "lucide-react";
import { useState } from "react";
import type { commerceApi, whatsappApi } from "@ll/shared";
import { Capsules, DataTable, DefList, Dot, EmptyState, ErrorLine, PageHeader, Panel, Row, RowList, Section, Sheet, SkeletonRows, StatBlock, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser, whenTor } from "@/components/dashboard/restaurant/shared";
import { askChannelLabel, languageName, orderChannelLabel, REPLY_LANGS, replyDraft, replyLang, resultLabel, unreadCaption, type ReplyLang } from "@/components/dashboard/restaurant/reviewReply";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { whatsappChatUrl } from "@/lib/restaurant/share";

export default function ReviewsPage() {
  return (
    <RestaurantGate featureKey="restaurant.reviews" title="Reviews">
      <Reviews />
    </RestaurantGate>
  );
}

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={className ?? "inline-flex items-center gap-0.5"} role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`size-3.5 ${i <= n ? "fill-fg text-fg" : "text-line-strong"}`} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function Reviews() {
  const { api, detail } = useMerchant();
  const stats = useApi(() => api.reviews.stats(), [api]);
  // Private feedback to read first: 1 to 3 stars the owner has not dealt with yet.
  const unread = useApi(() => api.reviews.list({ limit: 50, maxRating: 3, handled: "0" }), [api]);
  // Answered asks. Asks nobody has answered are collapsed into a count below the table.
  const list = useApi(() => api.reviews.list({ limit: 25, status: "responded" }), [api]);
  const [more, setMore] = useState<{ items: whatsappApi.ReviewDto[]; cursor: string | null } | null>(null);
  const loadMore = useAction();
  const [open, setOpen] = useState<whatsappApi.ReviewDto | null>(null);
  const [reply, setReply] = useState<{ review: whatsappApi.ReviewDto; chaiCode: string | null } | null>(null);
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  const act = useAction();

  if (stats.status === 402 || list.status === 402) return <TierTeaser featureKey="restaurant.reviews" title="Reviews" />;
  const s = stats.data;
  const link = s?.googleReviewUrl ?? null;
  const rows = [...(list.data?.items ?? []), ...(more?.items ?? [])];
  const cursor = more ? more.cursor : (list.data?.nextCursor ?? null);
  const waiting = s ? Math.max(0, s.requested - s.responded) : 0;
  const reload = () => {
    void stats.reload();
    void unread.reload();
    void list.reload();
    setMore(null);
  };

  const cols: Column<whatsappApi.ReviewDto>[] = [
    { key: "customer", header: "Guest", mobile: "title", cell: (r) => <span className="font-medium">{r.customer.name ?? "Guest"}</span> },
    { key: "order", header: "Order", mobile: "subtitle", cell: (r) => (r.orderNumber ? `#${r.orderNumber}` : "") },
    { key: "channel", header: "Asked by", mobile: "hidden", cell: (r) => askChannelLabel(r.channel) },
    { key: "when", header: "When", mobile: "hidden", sortValue: (r) => r.sentAt ?? r.createdAt, cell: (r) => (r.sentAt ? relativeTime(r.sentAt) : "Not sent yet") },
    { key: "result", header: "Result", mobile: "trailing", cell: (r) => resultLabel(r) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        flush
        title="Reviews"
        description="Ask every guest the same way, read the hard feedback first, and make leaving a Google review easy."
        actions={
          <Button size="sm" onClick={() => setAsking(true)}>
            Ask for a review
          </Button>
        }
      />
      {stats.error && !s ? <ErrorLine message={stats.error} onRetry={() => void stats.reload()} /> : null}
      <StatBlock
        label="Review numbers"
        loading={stats.loading && !s}
        items={[
          { label: "Average rating", value: s?.averageRating != null ? s.averageRating.toFixed(1) : "None yet", caption: s?.averageRating != null ? `${formatNumber(s.responded)} answers · ${formatNumber(s.requested)} asked` : "Shows after the first answer" },
          { label: "Answer rate", value: s ? `${Math.round(s.responseRate * 100)}%` : "", caption: s ? `${formatNumber(s.responded)} of ${formatNumber(s.sent)} sent` : "" },
          { label: "Opened the Google link", value: formatNumber(s?.googleOpened ?? 0), caption: s ? `Of ${formatNumber(s.requested)} asked` : "" },
          { label: "Private feedback to read", value: formatNumber(s?.privateToRead ?? 0), caption: unreadCaption(s?.privateToReadByRating) || "Nothing waiting" },
        ]}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Read first: private feedback" description="Guests who rated 1 to 3 stars and wrote to you. Reply in their language.">
            {unread.error && !unread.data ? (
              <ErrorLine message={unread.error} onRetry={() => void unread.reload()} />
            ) : !unread.data ? (
              <SkeletonRows rows={2} />
            ) : unread.data.items.length === 0 ? (
              <EmptyState title="Nothing to read right now" description="When a guest rates 1 to 3 stars, you will see it here first." />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {unread.data.items.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-4">
                    <div className="flex items-center gap-2 text-meta text-fg-muted">
                      <Stars n={r.rating ?? 0} />
                      <span className="min-w-0 truncate">{[r.customer.name ?? "Guest", r.orderNumber ? `Order #${r.orderNumber}` : null, orderChannelLabel(r.orderChannel)].filter(Boolean).join(" · ")}</span>
                      <span className="ms-auto shrink-0">
                        <Dot tone="accent">New</Dot>
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-body text-fg">{r.feedback ? `“${r.feedback}”` : "They left a rating without a comment."}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => setReply({ review: r, chaiCode: null })}>
                        Reply on WhatsApp in {languageName(replyLang(r.customerLanguage))}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={act.busy}
                        onClick={async () => {
                          const o = await act.run(() => api.reviewActions.offerChai(r.id));
                          if (o) setReply({ review: r, chaiCode: o.code });
                        }}
                      >
                        Offer a free chai
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.busy}
                        onClick={async () => {
                          if (await act.run(() => api.reviewActions.handled(r.id))) {
                            toast({ message: "Marked handled", tone: "success" });
                            reload();
                          }
                        }}
                      >
                        Mark handled
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {act.error ? <p role="alert" className="mt-2 text-meta text-negative">{act.error}</p> : null}
          </Section>

          <Section title="Recent asks" description="Every guest is asked the same way, whatever they ordered or how they rate.">
            <DataTable
              caption="Review asks that were answered"
              columns={cols}
              rows={rows}
              rowKey={(r) => r.id}
              loading={list.loading && !list.data}
              error={list.error}
              onRetry={() => void list.reload()}
              onRowClick={(r) => setOpen(r)}
              hasMore={!!cursor}
              loadingMore={loadMore.busy}
              onLoadMore={async () => {
                if (!cursor) return;
                const r = await loadMore.run(() => api.reviews.list({ limit: 25, cursor, status: "responded" }));
                if (r) setMore({ items: [...(more?.items ?? []), ...r.items], cursor: r.nextCursor });
              }}
              empty={<EmptyState title="No answers yet" description={link ? "After a guest picks up an order we ask for a rating. You can also ask about a recent order." : "Add your Google review link first. Then every picked-up order can lead to a rating."} action={<Button size="sm" variant="secondary" onClick={() => setAsking(true)}>Ask about an order</Button>} />}
            />
            {waiting > 0 ? <p className="mt-2 text-meta text-fg-muted">{formatNumber(waiting)} {waiting === 1 ? "ask has" : "asks have"} no answer yet. They are not listed here.</p> : null}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Section title="What every guest sees" description="The same screen at 1 star or 5 stars.">
            <GuestPreview shop={detail.merchant.name} hasLink={!!link} />
            <p className="mt-3 text-meta text-fg-muted">Both buttons show at every rating. Google can remove reviews from businesses that screen who is asked or who is shown the link.</p>
          </Section>
          <Section title="When we ask">
            <DefList
              items={[
                { label: "Timing", value: "2 hours after pickup or delivery" },
                { label: "Channel", value: "WhatsApp, then SMS, then email (only with consent)" },
                { label: "Language", value: "The guest's language" },
                { label: "Never twice", value: "Not within 14 days of the last ask" },
              ]}
            />
            <GoogleLink current={link} onSaved={reload} />
          </Section>
        </aside>
      </div>

      <Detail review={open} onClose={() => setOpen(null)} />
      <ReplySheet
        key={reply ? `${reply.review.id}:${reply.chaiCode ?? ""}` : "none"}
        target={reply}
        onClose={() => setReply(null)}
        onDone={() => {
          setReply(null);
          reload();
        }}
      />
      <Sheet open={asking} onClose={() => setAsking(false)} label="Ask for a review" title="Ask for a review" subtitle="Pick a recent order. We message the guest on the best channel they agreed to.">
        <AskForReview hasLink={!!link} onAsked={reload} />
      </Sheet>
    </div>
  );
}

/** A static copy of what /r/<token> shows: same two buttons, same weight. */
function GuestPreview({ shop, hasLink }: { shop: string; hasLink: boolean }) {
  return (
    <div className="rounded-card bg-bg-subtle p-5" aria-hidden>
      <p className="text-headline text-fg">How was {shop || "your visit"}?</p>
      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className="size-7 fill-fg text-fg" strokeWidth={1.5} />
        ))}
      </div>
      <p className="mt-3 text-meta text-fg-muted">Anything you want us to know? (private)</p>
      <div className="mt-1 h-10 rounded-input border border-line bg-bg px-3 text-meta leading-10 text-fg-subtle">Optional note</div>
      <div className="mt-3 flex flex-col gap-2">
        <span className={buttonClasses({ variant: "primary", size: "md", fullWidth: true })}>Send to the restaurant</span>
        {hasLink ? <span className={buttonClasses({ variant: "secondary", size: "md", fullWidth: true })}>Also leave a public Google review</span> : <span className="text-center text-caption text-fg-muted">Add your Google link to show the second button.</span>}
      </div>
    </div>
  );
}

function ReplySheet({ target, onClose, onDone }: { target: { review: whatsappApi.ReviewDto; chaiCode: string | null } | null; onClose: () => void; onDone: () => void }) {
  const { api, detail } = useMerchant();
  const shopName = detail.merchant.name;
  const toast = useToast();
  const r = target?.review ?? null;
  const [lang, setLang] = useState<ReplyLang>(replyLang(r?.customerLanguage));
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [body, setBody] = useState(() => (r ? replyDraft(replyLang(r.customerLanguage), { name: r.customer.name, shop: shopName, chaiCode: target?.chaiCode }) : ""));
  const [windowClosed, setWindowClosed] = useState(false);
  const act = useAction();
  if (!r) return <Sheet open={false} onClose={onClose} label="Reply" title="Reply">{null}</Sheet>;

  const redraft = (l: ReplyLang) => {
    setLang(l);
    setBody(replyDraft(l, { name: r.customer.name, shop: shopName, chaiCode: target?.chaiCode }));
  };
  const send = async () => {
    setWindowClosed(false);
    try {
      const out = await api.reviewActions.reply(r.id, { channel, body: body.trim() });
      if (out.sent) {
        toast({ message: `Reply sent by ${askChannelLabel(channel)}`, tone: "success" });
        onDone();
      }
    } catch (e) {
      if (isApiError(e) && e.code === "window_closed") setWindowClosed(true);
      else throw e;
    }
  };
  const phone = r.customerPhone;
  return (
    <Sheet
      open
      onClose={onClose}
      label="Reply to feedback"
      title={`Reply to ${r.customer.name ?? "this guest"}`}
      subtitle={`${r.rating ?? ""} star${r.rating === 1 ? "" : "s"}${r.orderNumber ? ` · Order #${r.orderNumber}` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={act.busy} disabled={!body.trim()} onClick={() => void act.run(send)}>
            Send reply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {r.feedback ? <blockquote className="whitespace-pre-wrap border-s-2 border-line ps-4 text-body text-fg">{r.feedback}</blockquote> : null}
        <Capsules label="Language" value={lang} onChange={redraft} options={REPLY_LANGS.map((l) => ({ value: l.value, label: l.label }))} />
        <Capsules label="Send by" value={channel} onChange={setChannel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} />
        <TextField type="textarea" label="Your reply" hint="Edit it before you send. Drafts in Hindi, Urdu and Punjabi should be read by someone who speaks the language." value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={7} dir={lang === "ur" ? "rtl" : "ltr"} />
        {target?.chaiCode ? <Banner tone="info">Free chai code {target.chaiCode} is in the message. It works once and lasts 30 days.</Banner> : null}
        {windowClosed ? (
          <Banner tone="warning" title="WhatsApp is closed for this guest">
            <span className="flex flex-col items-start gap-2">
              WhatsApp only lets us reply within 24 hours of their last message. Open WhatsApp on your phone to send it yourself, or choose SMS or email.
              {phone ? (
                <a href={whatsappChatUrl(phone, body)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <MessageCircle aria-hidden className="size-4" strokeWidth={1.75} /> Open WhatsApp
                </a>
              ) : null}
            </span>
          </Banner>
        ) : null}
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      </div>
    </Sheet>
  );
}

function GoogleLink({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const value = url ?? current ?? "";
  const error = (() => {
    const v = value.trim();
    if (!v) return null;
    try {
      const u = new URL(v);
      if (u.protocol !== "https:") return "The link has to start with https://";
    } catch {
      return "That doesn't look like a link. Paste the full address, starting with https://";
    }
    return null;
  })();
  const dirty = value.trim() !== (current ?? "");
  const save = async () => {
    if (error) return;
    const r = await act.run(() => api.reviews.saveSettings(value.trim() || null));
    if (r) {
      toast({ message: r.googleReviewUrl ? "Google review link saved" : "Google review link removed", tone: "success" });
      setUrl(null);
      onSaved();
    }
  };
  return (
    <Panel
      className="mt-4"
      title="Your Google review link"
      description="Every guest is offered this link, whatever they rate. Find it in Google Business Profile under Ask for reviews."
      footer={
        <>
          {current ? (
            <Button variant="ghost" size="sm" disabled={act.busy} onClick={async () => { const r = await act.run(() => api.reviews.saveSettings(null)); if (r) { setUrl(null); toast({ message: "Google review link removed", tone: "success" }); onSaved(); } }}>
              Remove link
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" disabled={!dirty || !!error} loading={act.busy} onClick={() => void save()}>
            Save link
          </Button>
        </>
      }
    >
      <TextField id="google-review-url" label="Link" type="url" inputMode="url" placeholder="https://g.page/r/your-shop/review" value={value} onChange={(e) => setUrl(e.target.value)} error={dirty ? error : null} />
      {act.error ? <p role="alert" className="mt-2 text-meta text-negative">{act.error}</p> : null}
    </Panel>
  );
}

function AskForReview({ hasLink, onAsked }: { hasLink: boolean; onAsked: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const orders = useApi(() => api.orders({ status: "picked_up", limit: 8 }), [api]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async (o: commerceApi.OrderDto) => {
    setBusyId(o.id);
    setError(null);
    try {
      const r = await api.reviews.request(o.id);
      toast({ message: r.sentAt ? `Asked ${o.customer?.name ?? "the guest"} for a review by ${askChannelLabel(r.channel)}` : "Review request saved", tone: "success" });
      onAsked();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };
  const items = orders.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3">
      {!hasLink ? <Banner tone="info">Add your Google review link first, so there is somewhere to send happy guests.</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {orders.loading && !orders.data ? (
        <SkeletonRows rows={3} />
      ) : orders.error ? (
        <ErrorLine message="We couldn't load recent orders." onRetry={() => void orders.reload()} />
      ) : items.length === 0 ? (
        <p className="text-meta text-fg-muted">Picked-up orders show up here. Ask about one as soon as the guest leaves.</p>
      ) : (
        <RowList label="Recent picked-up orders">
          {items.map((o) => (
            <Row
              key={o.id}
              title={`#${o.number} · ${o.customer?.name ?? "Guest"}`}
              meta={`${formatMoney(o.totalCents)} · ${o.pickedUpAt ? relativeTime(o.pickedUpAt) : relativeTime(o.createdAt)}`}
              trailing={
                <Button size="sm" variant="secondary" disabled={!hasLink || (busyId !== null && busyId !== o.id)} loading={busyId === o.id} onClick={() => void ask(o)}>
                  Ask
                </Button>
              }
            />
          ))}
        </RowList>
      )}
    </div>
  );
}

function Detail({ review, onClose }: { review: whatsappApi.ReviewDto | null; onClose: () => void }) {
  const r = review;
  return (
    <Sheet open={!!r} onClose={onClose} label="Review detail" title={r?.customer.name ?? "Guest"} subtitle={r?.responded ? "Answer" : "Review request"}>
      {r ? (
        <div className="flex flex-col gap-5">
          <div>{r.rating ? <Stars n={r.rating} className="inline-flex items-center gap-1 [&_svg]:size-5" /> : <p className="text-meta text-fg-muted">They haven&apos;t answered yet.</p>}</div>
          {r.feedback ? <blockquote className="whitespace-pre-wrap border-s-2 border-line ps-4 text-body text-fg">{r.feedback}</blockquote> : r.responded ? <p className="text-meta text-fg-muted">They left a rating without a comment.</p> : null}
          {r.reply ? (
            <div className="rounded-card bg-bg-subtle px-4 py-3">
              <p className="text-meta-strong text-fg">Your reply by {askChannelLabel(r.reply.channel)}, {whenTor(r.reply.at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-meta text-fg-muted">{r.reply.body}</p>
            </div>
          ) : null}
          <DefList
            items={[
              { label: "Asked by", value: askChannelLabel(r.channel) },
              { label: "Sent", value: r.sentAt ? whenTor(r.sentAt) : "Not sent yet" },
              { label: "Opened the page", value: r.clickedAt ? whenTor(r.clickedAt) : "Not yet" },
              { label: "Opened the Google link", value: r.googleOpenedAt ? whenTor(r.googleOpenedAt) : "No" },
              { label: "Order", value: r.orderNumber ? `#${r.orderNumber}${r.orderChannel ? ` · ${orderChannelLabel(r.orderChannel)}` : ""}` : "None" },
              { label: "Handled", value: r.handledAt ? whenTor(r.handledAt) : r.rating != null && r.rating <= 3 ? "Not yet" : "Not needed" },
            ]}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
