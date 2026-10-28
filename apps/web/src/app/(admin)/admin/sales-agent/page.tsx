"use client";
/**
 * The founder's review console for the sales assistant (frames B1 and B2): the hand-off queue and every conversation, the
 * transcript with the tools the assistant ran, take over / reply as a person / hand back, thumbs on answers, and a quality tab
 * (five numbers, what failed, the eval set).
 */
import { ArrowLeft, ThumbsDown, ThumbsUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { salesAgentApi } from "@ll/shared";
import { Capsules, Dot, EmptyState, ErrorLine, PageHeader, Panel, SkeletonRows, StatBlock } from "@/components/dashboard";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, guardLabel, languageName, toolLabel, waiting } from "@/lib/sales-agent/console";

type View = "queue" | "all" | "rated_down" | "quality";
const api = browserApi.admin.salesAgent;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase();

export default function SalesAgentPage() {
  const params = useSearchParams();
  const [view, setView] = useState<View>("queue");
  const [sel, setSel] = useState<string | null>(params.get("c"));
  const now = useNow();
  const queue = useApi(() => api.list({ view: "queue", limit: 100 }), [], { pollMs: 15000 });
  const list = useApi(view === "quality" ? null : () => api.list({ view: view === "queue" ? "queue" : view, limit: 100 }), [view], { pollMs: 15000 });
  const items = list.data?.items ?? [];
  const waitingCount = queue.data?.items.length ?? 0;
  // The chat you are in stays open when its status moves it out of this list (taking over leaves the queue).
  const selId = sel ?? items[0]?.id ?? null;
  const [mobile, setMobile] = useState<"list" | "thread">(params.get("c") ? "thread" : "list");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sales agent" description="Conversations from WhatsApp and the website. Take over any chat; the assistant goes quiet." />
      <Capsules<View>
        label="View"
        value={view}
        onChange={(v) => {
          setView(v);
          setMobile("list");
        }}
        options={[
          { value: "queue", label: "Needs a person", count: waitingCount || null },
          { value: "all", label: "All" },
          { value: "rated_down", label: "Rated down" },
          { value: "quality", label: "Quality" },
        ]}
      />
      {view === "quality" ? (
        <Quality />
      ) : (
        <div className="overflow-hidden rounded-card border border-line lg:grid lg:h-[calc(100dvh-260px)] lg:min-h-[560px] lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className={cn("min-h-0 flex-col overflow-y-auto border-line bg-bg lg:flex lg:border-e", mobile === "thread" ? "hidden lg:flex" : "flex")}>
            {list.error && !list.data ? <div className="p-4"><ErrorLine message={list.error} onRetry={() => void list.reload()} /></div> : null}
            {list.loading && !list.data ? <div className="p-4"><SkeletonRows rows={5} /></div> : null}
            {list.data && !items.length ? (
              <div className="p-5">
                <EmptyState className="sm:flex-col sm:items-start" title={view === "queue" ? "Nobody is waiting" : "No conversations yet"} description={view === "queue" ? "When the assistant hands a chat to a person, it appears here with how long it has waited." : "Chats from the website widget and the WhatsApp number appear here."} />
              </div>
            ) : null}
            <ul aria-label="Conversations" className="divide-y divide-line">
              {items.map((c) => {
                const on = selId === c.id;
                const wait = c.status === "handoff" ? waiting(c.handoffAt, now) : null;
                return (
                  <li key={c.id}>
                    <button type="button" aria-current={on ? "true" : undefined} onClick={() => { setSel(c.id); setMobile("thread"); }} className={cn("flex w-full flex-col gap-0.5 px-4 py-3 text-start focus-visible:focus-ring", on ? "bg-bg-subtle" : "hover:bg-bg-subtle")}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-body font-medium text-fg">{c.contactName ?? c.contact ?? "Website visitor"}</span>
                        <Dot tone={STATUS_TONE[c.status]} className="shrink-0 text-caption text-fg-muted">{wait ? `${STATUS_LABEL[c.status]} · ${wait}` : STATUS_LABEL[c.status]}</Dot>
                      </span>
                      <span className="text-caption text-fg-muted">{c.channel === "whatsapp" ? "WhatsApp" : "Web"} · {languageName(c.language)}{c.verified ? " · verified owner" : ""}{c.ratedDown ? ` · ${c.ratedDown} rated down` : ""}</span>
                      <span dir="auto" className="truncate text-meta text-fg">{c.lastMessage || "No messages"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className={cn("min-h-[480px] min-w-0 lg:min-h-0", mobile === "list" ? "hidden lg:block" : "block")}>
            {selId ? <Thread key={selId} id={selId} onBack={() => setMobile("list")} onChanged={() => { void list.reload(); void queue.reload(); }} /> : <div className="hidden h-full items-center justify-center p-8 text-meta text-fg-muted lg:flex">Pick a conversation to read it.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const act = useAction();
  const now = useNow();
  const d = useApi(() => api.get(id), [id], { pollMs: 5000 });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const c = d.data;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [c?.messages.length]);

  const run = async (fn: () => Promise<salesAgentApi.ConversationDetail>, done?: string) => {
    const r = await act.run(fn);
    if (r) {
      d.setData(r);
      onChanged();
      if (done) toast({ message: done, tone: "success" });
    }
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    await run(() => api.reply(id, body));
    setText("");
  };
  const rate = async (m: salesAgentApi.TranscriptMessage, rating: "up" | "down") => {
    const next = m.feedback === rating ? null : rating;
    const r = await act.run(() => api.rate(m.id, next).then(() => true));
    if (r) {
      d.setData(c ? { ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, feedback: next } : x)) } : c);
      onChanged();
    }
  };

  if (d.error && !c) return <div className="p-5"><ErrorLine message={d.error} onRetry={() => void d.reload()} /></div>;
  if (!c) return <div className="p-5"><SkeletonRows rows={4} /></div>;
  const mine = c.status === "human";
  const wait = c.status === "handoff" ? waiting(c.handoffAt, now) : null;
  const canReply = c.channel === "web" || c.windowOpen;
  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <button type="button" onClick={onBack} aria-label="Back to conversations" className="-ms-2 inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring lg:hidden">
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-fg">{c.contactName ?? c.contact ?? "Website visitor"}</h2>
            <p className="truncate text-meta text-fg-muted">
              {c.channel === "whatsapp" ? "WhatsApp" : `Web${c.page ? ` · ${c.page}` : ""}`} · {languageName(c.language)}
              {c.channel === "whatsapp" ? (c.windowOpen ? ` · window open until ${timeOf(c.windowClosesAt!)}` : " · 24-hour window closed") : ""}
            </p>
          </div>
          <Dot tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Dot>
          {mine ? (
            <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void run(() => api.release(id), "The assistant is answering this chat again.")}>Hand back</Button>
          ) : (
            <Button size="sm" loading={act.busy} onClick={() => void run(() => api.takeOver(id), "You have this chat. The assistant stays quiet.")}>Take over</Button>
          )}
          {c.status !== "closed" ? <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void run(() => api.close(id), "Closed.")}>Close</Button> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-subtle px-5 py-5" aria-live="polite" aria-label="Messages">
          <ol className="flex flex-col gap-3">
            {c.messages.map((m) => (
              <li key={m.id}>
                {m.role === "system" ? (
                  <p className="mx-auto w-fit max-w-full rounded-full border border-line bg-bg px-3 py-1 text-center text-caption text-fg-muted">{m.text.startsWith("Blocked draft") ? "Blocked draft (never sent): " + m.text.slice(15, 200) : m.text} · {timeOf(m.at)}</p>
                ) : (
                  <div className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                    <p dir="auto" className={cn("max-w-[78%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-body", m.role === "user" ? "bg-fg text-bg" : m.role === "human" ? "bg-location/10 text-fg" : "border border-line bg-bg text-fg")}>{m.text}</p>
                    {m.toolCalls.length ? (
                      <ul className="flex max-w-[78%] flex-wrap gap-1.5" aria-label="Tools the assistant used">
                        {m.toolCalls.map((t, i) => (
                          <li key={i} title={JSON.stringify(t.input)} className={cn("rounded-md border px-2 py-0.5 text-caption", t.ok ? "border-line bg-bg text-fg-muted" : "border-negative text-negative")}>
                            {toolLabel(t.name)} · {t.summary}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.guard ? <p className="text-caption text-negative">Guardrail: {guardLabel(m.guard)}</p> : null}
                    <span className="flex items-center gap-2 px-1 text-caption text-fg-muted">
                      {m.role === "assistant" ? "Assistant" : m.role === "human" ? (m.humanName ?? "Team") : "Visitor"} · {timeOf(m.at)}
                      {m.role === "assistant" ? (
                        <span className="inline-flex gap-1">
                          <button type="button" aria-label="Good answer" aria-pressed={m.feedback === "up"} onClick={() => void rate(m, "up")} className={cn("inline-flex size-7 items-center justify-center rounded-full hover:bg-bg-muted focus-visible:focus-ring", m.feedback === "up" && "bg-bg-muted text-positive")}><ThumbsUp aria-hidden className="size-3.5" /></button>
                          <button type="button" aria-label="Bad answer" aria-pressed={m.feedback === "down"} onClick={() => void rate(m, "down")} className={cn("inline-flex size-7 items-center justify-center rounded-full hover:bg-bg-muted focus-visible:focus-ring", m.feedback === "down" && "bg-bg-muted text-negative")}><ThumbsDown aria-hidden className="size-3.5" /></button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div ref={end} />
        </div>
        <form className="flex flex-col gap-2 border-t border-line bg-bg p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor="agent-reply" className="text-caption text-fg-muted">
            {canReply ? (mine ? "Replying as a person." : "Replying takes over this chat: the assistant stops.") : "More than 24 hours since their last WhatsApp message: only an approved template can be sent, so replying is off. Wait for them to write, or call."}
          </label>
          <div className="flex items-center gap-2">
            <input id="agent-reply" value={text} disabled={!canReply} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a reply…" dir="auto" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-body text-fg placeholder:text-fg-muted focus-visible:focus-ring disabled:bg-bg-subtle" />
            <Button type="submit" disabled={!canReply || !text.trim()} loading={act.busy}>Send</Button>
          </div>
          {act.error ? <p role="alert" className="text-meta text-negative">{act.error}</p> : null}
        </form>
      </div>
      <aside aria-label="Details" className="hidden min-h-0 overflow-y-auto border-s border-line p-5 xl:block">
        <dl className="flex flex-col gap-4 text-meta">
          {c.status === "handoff" ? <Detail label="Hand-off">{c.handoffReason ?? "A person was requested."}{wait ? <span className="mt-0.5 block text-points-text">Waiting {wait}</span> : null}</Detail> : null}
          <Detail label="Contact">{c.channel === "whatsapp" ? (c.contact ?? "") : "Website visitor"}{c.verified ? " · phone verified" : " · not verified"}</Detail>
          <Detail label="Lead">{c.leadId ? `Created (id ${c.leadId.slice(0, 8)}), in the rep console` : "None yet"}</Detail>
          {c.callRequest ? <Detail label="Founder call requested">{c.callRequest.note}{c.callRequest.at ? ` · ${formatDateTime(c.callRequest.at)}` : ""}<span className="mt-0.5 block text-fg-muted">A request, not a booking.</span></Detail> : null}
          {c.takenOverBy ? <Detail label="Taken over by">{c.takenOverBy}</Detail> : null}
          <Detail label="Started">{formatDateTime(c.createdAt)}</Detail>
          <Detail label="Tools used">
            <ul className="mt-1 flex flex-col gap-1">
              {c.messages.flatMap((m) => m.toolCalls).map((t, i) => <li key={i} className="rounded-md bg-bg-subtle px-2 py-1 text-caption">{t.name} · {t.ok ? "ok" : "failed"}</li>)}
              {!c.messages.some((m) => m.toolCalls.length) ? <li className="text-fg-muted">None</li> : null}
            </ul>
          </Detail>
          <p className="text-caption text-fg-muted">Rate an answer with the thumbs under it. Ratings feed the Quality tab and the eval set.</p>
        </dl>
      </aside>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-fg">{children}</dd>
    </div>
  );
}

function Quality() {
  const q = useApi(() => api.quality(), []);
  if (q.error && !q.data) return <ErrorLine message={q.error} onRetry={() => void q.reload()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  const { metrics: m, cases } = q.data;
  const rated = m.ratedUp + m.ratedDown;
  const trips = Object.entries(m.guardrailTrips);
  return (
    <div className="flex flex-col gap-4">
      {!q.data.modelConfigured ? <Banner tone="warning" title="No model is configured">Set ANTHROPIC_API_KEY on the API. Until then every chat goes to the queue with the offline message.</Banner> : null}
      <StatBlock
        label={`Last ${m.days} days`}
        cols={5}
        items={[
          { label: "Conversations", value: m.conversations, caption: `${m.byChannel.web} web · ${m.byChannel.whatsapp} WhatsApp` },
          { label: "Handled without a person", value: `${m.handledPct}%`, caption: `${m.handoffs} handed off` },
          { label: "Rated up / down", value: `${m.ratedUp} / ${m.ratedDown}`, caption: rated ? `${Math.round((m.ratedUp / rated) * 100)}% up` : "No ratings yet" },
          { label: "Guardrail trips", value: trips.reduce((n, [, v]) => n + v, 0), caption: trips.map(([k, v]) => `${guardLabel(k)} ×${v}`).join(", ") || "None", dot: trips.length ? "negative" : undefined },
          { label: "Tool errors", value: m.toolErrors, caption: `of ${m.toolCalls} tool calls` },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title={`Eval set · ${cases.length} questions`} description={`Run it against the live model with: ${q.data.evalCommand} (needs ANTHROPIC_API_KEY; model ${q.data.model}). See docs/engineering/sales-agent-evals.md.`} padded={false}>
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-5 py-2.5">
                <span className="mt-0.5 rounded-md bg-bg-subtle px-1.5 py-0.5 text-caption font-medium text-fg-muted">{c.lang}</span>
                <span dir="auto" className="min-w-0 flex-1 text-meta text-fg">{c.question}</span>
                <span className="hidden max-w-[40%] text-caption text-fg-muted md:block">expects: {c.expect}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Where it falls short">
          <div className="flex flex-col gap-4 text-meta">
            <Block title="Hand-off reasons" rows={m.handoffReasons.map((r) => [r.reason, r.n])} />
            <Block title="Languages" rows={m.languages.map((r) => [languageName(r.language), r.n])} />
            <Block title="Most used tools" rows={m.topTools.map((r) => [r.name, r.n])} />
            <div>
              <h3 className="text-caption font-semibold uppercase tracking-wide text-fg-muted">Rated down</h3>
              {m.recentDown.length ? (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {m.recentDown.map((r) => <li key={r.messageId}><a className="underline underline-offset-2" href={`/admin/sales-agent?c=${r.conversationId}`}>{r.text}</a></li>)}
                </ul>
              ) : <p className="mt-1 text-fg-muted">Nothing rated down.</p>}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Block({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h3 className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      {rows.length ? <ul className="mt-1 flex flex-col gap-1">{rows.map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span className="truncate">{k}</span><span className="tabular text-fg-muted">{n}</span></li>)}</ul> : <p className="mt-1 text-fg-muted">No data yet.</p>}
    </div>
  );
}
