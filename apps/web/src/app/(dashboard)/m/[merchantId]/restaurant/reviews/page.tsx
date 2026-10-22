"use client";
import { Star } from "lucide-react";
import { useState } from "react";
import type { commerceApi, whatsappApi } from "@ll/shared";
import { Capsules, DataTable, DefList, Dot, EmptyState, ErrorLine, Meter, PageHeader, Panel, Row, RowList, Section, Sheet, SkeletonRows, StatBlock, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser, whenTor } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const CHANNEL: Record<string, string> = { sms: "Text", whatsapp: "WhatsApp", email: "Email", push: "App push" };
const channelName = (c: string) => CHANNEL[c] ?? c;

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
type StatusFilter = "all" | "responded" | "pending";

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
  const { api } = useMerchant();
  const stats = useApi(() => api.reviews.stats(), [api]);
  const [rating, setRating] = useState<RatingFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const key = `${rating}|${status}`;
  const list = useApi(() => api.reviews.list({ limit: 25, rating: rating === "all" ? undefined : Number(rating), status: status === "all" ? undefined : status }), [api, key]);
  const [more, setMore] = useState<{ key: string; items: whatsappApi.ReviewDto[]; cursor: string | null } | null>(null);
  const loadMore = useAction();
  const [open, setOpen] = useState<whatsappApi.ReviewDto | null>(null);

  if (stats.status === 402 || list.status === 402) return <TierTeaser featureKey="restaurant.reviews" title="Reviews" />;
  const extra = more?.key === key ? more : null;
  const rows = [...(list.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : (list.data?.nextCursor ?? null);
  const s = stats.data;
  const filtered = rating !== "all" || status !== "all";
  const link = s?.googleReviewUrl ?? null;

  const cols: Column<whatsappApi.ReviewDto>[] = [
    { key: "customer", header: "Customer", mobile: "title", cell: (r) => <span className="font-medium">{r.customer.name ?? "Customer"}</span> },
    { key: "rating", header: "Rating", mobile: "trailing", sortValue: (r) => r.rating, cell: (r) => (r.rating ? <Stars n={r.rating} /> : <span className="text-fg-muted">No answer yet</span>) },
    { key: "feedback", header: "What they said", mobile: "subtitle", cell: (r) => <span className="line-clamp-1 max-w-[320px] text-fg-muted">{r.feedback ?? (r.responded ? "No comment" : "")}</span> },
    { key: "channel", header: "Asked by", mobile: "hidden", cell: (r) => channelName(r.channel) },
    { key: "when", header: "Asked", mobile: "subtitle", sortValue: (r) => r.sentAt ?? r.createdAt, cell: (r) => (r.sentAt ? relativeTime(r.sentAt) : "Not sent yet") },
    { key: "status", header: "Status", mobile: "hidden", cell: (r) => (r.responded ? <Dot tone="positive">Answered</Dot> : r.clickedAt ? <Dot tone="info">Opened</Dot> : <Dot>Waiting</Dot>) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader flush title="Reviews" description="Ask after pickup, hear the hard feedback first, and make it easy to leave a Google review." />
      {stats.error && !s ? <ErrorLine message={stats.error} onRetry={() => void stats.reload()} /> : null}
      <Snapshot stats={s ?? null} loading={stats.loading && !s} />
      <div className="grid gap-8 lg:grid-cols-2">
        <GoogleLink current={link} onSaved={() => void stats.reload()} />
        <div id="ask-for-review" className="min-w-0">
          <AskForReview hasLink={!!link} onAsked={() => { void list.reload(); void stats.reload(); }} />
        </div>
      </div>
      <Section title="All requests" description="Ratings of 3 or less stay private to you. Customers are still offered the Google link, whatever they rate.">
        <DataTable
          caption="Review requests"
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
            const r = await loadMore.run(() => api.reviews.list({ limit: 25, cursor, rating: rating === "all" ? undefined : Number(rating), status: status === "all" ? undefined : status }));
            if (r) setMore({ key, items: [...(extra?.items ?? []), ...r.items], cursor: r.nextCursor });
          }}
          toolbar={
            <div className="flex flex-col gap-2">
              <Capsules label="Filter by rating" value={rating} onChange={setRating} options={[{ value: "all", label: "All ratings" }, ...(["5", "4", "3", "2", "1"] as const).map((v) => ({ value: v, label: `${v} star${v === "1" ? "" : "s"}` }))]} />
              <Capsules label="Filter by status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "responded", label: "Answered" }, { value: "pending", label: "Waiting for a reply" }]} />
            </div>
          }
          empty={
            filtered ? (
              <EmptyState title="Nothing matches those filters" description="Try another rating or status." action={<Button size="sm" variant="secondary" onClick={() => { setRating("all"); setStatus("all"); }}>Clear filters</Button>} />
            ) : (
              <EmptyState
                title="No review requests yet"
                description={link ? "After a customer picks up an order we ask them for a rating. You can also ask about a recent order above." : "Add your Google review link first. Then every picked-up order can lead to a rating."}
                action={<Button size="sm" variant="secondary" onClick={() => (link ? document.getElementById("ask-for-review")?.scrollIntoView({ behavior: "smooth", block: "center" }) : document.getElementById("google-review-url")?.focus())}>{link ? "Ask about an order" : "Add your Google link"}</Button>}
              />
            )
          }
        />
      </Section>
      <Detail review={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Snapshot({ stats, loading }: { stats: whatsappApi.ReviewStats | null; loading: boolean }) {
  const dist = stats?.distribution;
  const max = dist ? Math.max(1, ...Object.values(dist)) : 1;
  return (
    <section aria-label="Review numbers" className="flex flex-col gap-6">
      <StatBlock
        label="Review numbers"
        loading={loading}
        items={[
          { label: "Average rating", value: stats?.averageRating != null ? stats.averageRating.toFixed(1) : "None yet", caption: stats?.averageRating != null ? "out of 5" : "Shows after the first rating" },
          { label: "Reply rate", value: stats ? `${Math.round(stats.responseRate * 100)}%` : "", caption: stats ? `${formatNumber(stats.responded)} of ${formatNumber(stats.sent)} sent` : "" },
          { label: "Asked", value: formatNumber(stats?.requested ?? 0), caption: `${formatNumber(stats?.sent ?? 0)} sent` },
          { label: "Opened the page", value: formatNumber(stats?.opened ?? 0) },
        ]}
      />
      <div>
        <h2 className="text-meta text-fg-muted">How people rated you</h2>
        {loading || !dist ? (
          <SkeletonRows rows={5} />
        ) : (
          <ul className="mt-2 flex max-w-[560px] flex-col gap-2" aria-label="Ratings from 5 stars down to 1">
            {(["5", "4", "3", "2", "1"] as const).map((n) => (
              <li key={n} className="grid grid-cols-[2.25rem_1fr_2.5rem] items-center gap-3 text-meta">
                <span className="inline-flex items-center gap-1 tabular text-fg">
                  {n}
                  <Star aria-hidden className="size-3 fill-fg text-fg" strokeWidth={1.5} />
                </span>
                <Meter value={dist[n]} max={max} label={`${n} star: ${dist[n]}`} className="h-2" />
                <span className="text-end tabular text-fg-muted">{formatNumber(dist[n])}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
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
      title="Your Google review link"
      description="Customers are always offered this link after they rate, and it leads for 4 and 5 stars. Find it in Google Business Profile under Ask for reviews."
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
      toast({ message: r.sentAt ? `Asked ${o.customer?.name ?? "the customer"} for a review by ${channelName(r.channel).toLowerCase()}` : "Review request saved", tone: "success" });
      onAsked();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };
  const items = orders.data?.items ?? [];
  return (
    <Panel title="Ask for a review" description="Pick a recent order. We message the customer on the best channel they agreed to: WhatsApp, text, email or the app.">
      {!hasLink ? <Banner tone="info" className="mb-3">Add your Google review link first, so there is somewhere to send happy customers.</Banner> : null}
      {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
      {orders.loading && !orders.data ? (
        <SkeletonRows rows={3} />
      ) : orders.error ? (
        <ErrorLine message="We couldn't load recent orders." onRetry={() => void orders.reload()} />
      ) : items.length === 0 ? (
        <p className="text-meta text-fg-muted">Picked-up orders show up here. Ask about one as soon as the customer leaves.</p>
      ) : (
        <RowList label="Recent picked-up orders">
          {items.map((o) => (
            <Row
              key={o.id}
              title={`#${o.number} · ${o.customer?.name ?? "Customer"}`}
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
    </Panel>
  );
}

function Detail({ review, onClose }: { review: whatsappApi.ReviewDto | null; onClose: () => void }) {
  const r = review;
  return (
    <Sheet open={!!r} onClose={onClose} label="Review detail" title={r?.customer.name ?? "Customer"} subtitle={r?.responded ? "Private feedback" : "Review request"}>
      {r ? (
        <div className="flex flex-col gap-5">
          <div>
            {r.rating ? <Stars n={r.rating} className="inline-flex items-center gap-1 [&_svg]:size-5" /> : <p className="text-meta text-fg-muted">They haven&apos;t answered yet.</p>}
          </div>
          {r.feedback ? (
            <blockquote className="whitespace-pre-wrap border-s-2 border-line ps-4 text-body text-fg">{r.feedback}</blockquote>
          ) : r.responded ? (
            <p className="text-meta text-fg-muted">They left a rating without a comment.</p>
          ) : null}
          {r.rating && r.rating <= 3 ? <Banner tone="info">This stayed private. {r.customer.name ?? "They"} were also offered your Google link. A quick call or message can turn it around.</Banner> : null}
          <DefList
            items={[
              { label: "Asked by", value: channelName(r.channel) },
              { label: "Sent", value: r.sentAt ? whenTor(r.sentAt) : "Not sent yet" },
              { label: "Opened the page", value: r.clickedAt ? whenTor(r.clickedAt) : "Not yet" },
              { label: "Order", value: r.orderId ? "Linked" : "None" },
            ]}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
