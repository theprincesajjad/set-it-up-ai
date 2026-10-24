"use client";
/**
 * WhatsApp inbox (frame 06): the list of chats, one chat with what the ordering assistant did (the parsed order, a summary
 * card and the pay link), a reply box that follows the 24-hour window, "Take over" to stop the assistant on this chat, and
 * the guest panel (visits, usual, points, notes, consent, language).
 */
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { restaurantApi, whatsappApi } from "@ll/shared";
import { Dot, EmptyState, ErrorLine, SkeletonRows } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CopyButton, formatPhone, whenTor } from "@/components/dashboard/restaurant/shared";
import { TakeOrderSheet } from "@/components/dashboard/restaurant/TakeOrderSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";
import { chatStatus, initials, languageLabel, windowHoursLeft } from "@/lib/restaurant/inbox";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase();

export function Inbox({ sessions, connected, onSetup, onTemplates }: { sessions: { data: { items: whatsappApi.WhatsappSession[] } | null; error: string | null; loading: boolean; reload: () => Promise<void> }; connected: boolean; onSetup: () => void; onTemplates: () => void }) {
  const items = sessions.data?.items ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [mobile, setMobile] = useState<"list" | "thread">("list");
  const current = items.find((s) => s.id === sel) ?? items[0] ?? null;
  return (
    <div className="overflow-hidden rounded-card border border-line lg:grid lg:h-[calc(100dvh-300px)] lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className={cn("min-h-0 flex-col overflow-y-auto border-line lg:flex lg:border-e", mobile === "thread" ? "hidden lg:flex" : "flex")}>
        {sessions.error && !sessions.data ? <div className="p-4"><ErrorLine message={sessions.error} onRetry={() => void sessions.reload()} /></div> : null}
        {sessions.loading && !sessions.data ? <div className="p-4"><SkeletonRows rows={5} /></div> : null}
        {sessions.data && !items.length ? (
          <div className="p-5">
            <EmptyState
              title="No chats yet"
              description="A chat shows up here when a guest messages your WhatsApp number, or when you record their opt-in under Setup."
              action={!connected ? <Button size="sm" variant="secondary" onClick={onSetup}>Connect WhatsApp</Button> : undefined}
            />
          </div>
        ) : null}
        <ul aria-label="Chats" className="divide-y divide-line">
          {items.map((s) => {
            const st = chatStatus(s);
            const on = current?.id === s.id;
            return (
              <li key={s.id}>
                <button type="button" aria-current={on ? "true" : undefined} onClick={() => { setSel(s.id); setMobile("thread"); }} className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-start focus-visible:focus-ring", on ? "bg-bg-subtle" : "hover:bg-bg-subtle")}>
                  <span aria-hidden className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[12px] font-semibold text-fg-muted">{initials(s.name, s.phone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-body font-medium text-fg">{s.name ?? formatPhone(s.phone)}</span>
                      {s.lastMessageAt ? <span className="shrink-0 text-caption text-fg-muted">{timeOf(s.lastMessageAt)}</span> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-meta text-fg-muted">{s.preview ?? (s.cartItems ? `Cart · ${s.cartItems} items` : "No messages yet")}</span>
                    <Dot tone={st.tone} className="mt-1 text-caption text-fg-muted">{st.label}</Dot>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={cn("min-h-[480px] min-w-0 lg:min-h-0", mobile === "list" ? "hidden lg:block" : "block")}>
        {current ? <Thread key={current.id} session={current} onBack={() => setMobile("list")} onChanged={() => void sessions.reload()} onTemplates={onTemplates} /> : <div className="hidden h-full items-center justify-center p-8 text-meta text-fg-muted lg:flex">Pick a chat to read it.</div>}
      </div>
    </div>
  );
}

function Thread({ session, onBack, onChanged, onTemplates }: { session: whatsappApi.WhatsappSession; onBack: () => void; onChanged: () => void; onTemplates: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const now = useNow();
  const msgs = useApi(() => api.whatsapp.messages(session.id), [api, session.id], { pollMs: 5000 });
  const guest = useApi(() => api.whatsapp.guest(session.id), [api, session.id]);
  const [text, setText] = useState("");
  const [showGuest, setShowGuest] = useState(false);
  const [order, setOrder] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const d = msgs.data;
  const left = d ? windowHoursLeft(d.windowOpenUntil, now) : null;
  const open = left !== null && left > 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [d?.items.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const r = await act.run(() => api.whatsapp.sendMessage(session.id, body));
    if (r) {
      setText("");
      await msgs.reload();
      onChanged();
    }
  };
  const toggleTakeover = async () => {
    const r = await act.run(() => (d?.takenOver ? api.whatsapp.release(session.id) : api.whatsapp.takeOver(session.id)));
    if (r) {
      msgs.setData(r);
      onChanged();
      toast({ message: r.takenOver ? "You have this chat. The assistant stays quiet." : "The assistant is answering this chat again.", tone: "success" });
    }
  };
  const name = guest.data?.name ?? session.name ?? formatPhone(session.phone);

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <button type="button" onClick={onBack} aria-label="Back to chats" className="-ms-2 inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring lg:hidden">
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-fg">{name}{guest.data?.name ? ` · ${formatPhone(session.phone)}` : ""}</h2>
            <p className="truncate text-meta text-fg-muted">
              {languageLabel(session.language)}
              {session.optedIn ? " · opted in to WhatsApp" : " · not opted in"}
            </p>
          </div>
          <span className={cn("hidden shrink-0 rounded-full px-2.5 py-1 text-caption sm:inline", d?.takenOver ? "bg-fg text-bg" : "bg-bg-muted text-fg-muted")}>{d?.takenOver ? "You have this chat" : "Assistant on"}</span>
          <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void toggleTakeover()}>{d?.takenOver ? "Hand back" : "Take over"}</Button>
          <Button size="sm" variant="ghost" className="xl:hidden" onClick={() => setShowGuest((v) => !v)} aria-expanded={showGuest}>Guest</Button>
        </header>
        {showGuest ? <div className="border-b border-line xl:hidden"><GuestPanel guest={guest.data} session={session} onOrder={() => setOrder(true)} onChanged={onChanged} /></div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-subtle px-5 py-5" aria-live="polite" aria-label={`Messages with ${name}`}>
          {msgs.error && !d ? <ErrorLine message={msgs.error} onRetry={() => void msgs.reload()} /> : null}
          {!d && !msgs.error ? <SkeletonRows rows={4} /> : null}
          {d && !d.items.length ? <p className="text-meta text-fg-muted">No messages yet.</p> : null}
          <ol className="flex flex-col gap-3">
            {(d?.items ?? []).map((m) => (
              <li key={m.id} className={cn("flex flex-col", m.direction === "out" ? "items-end" : "items-start")}>
                <Bubble m={m} />
                <span className="mt-1 px-1 text-caption text-fg-subtle">
                  {m.sender === "assistant" ? "Assistant · " : m.sender === "staff" ? "You · " : m.sender === "system" ? "Automatic · " : ""}
                  {timeOf(m.createdAt)}
                </span>
              </li>
            ))}
          </ol>
          <div ref={end} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-line bg-bg p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="wa-reply">Reply</label>
          <input
            id="wa-reply"
            value={text}
            disabled={!open || session.state === "opted_out"}
            onChange={(e) => setText(e.target.value)}
            maxLength={1500}
            placeholder={session.state === "opted_out" ? "They asked us to stop messaging them." : open ? `Reply in ${languageLabel(session.language)} or English. Free for ${left} more ${left === 1 ? "hour" : "hours"}.` : "The 24-hour window is closed. Send an approved template instead."}
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-body text-fg placeholder:text-fg-subtle focus-visible:focus-ring disabled:bg-bg-subtle"
          />
          <button type="button" onClick={onTemplates} className="inline-flex h-10 shrink-0 items-center rounded-full border border-line px-4 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">Templates</button>
          <Button type="submit" size="md" disabled={!open || !text.trim()} loading={act.busy}>Send</Button>
        </form>
        {act.error ? <p role="alert" className="border-t border-line bg-bg px-4 py-2 text-meta text-negative">{act.error}</p> : null}
      </div>
      <aside aria-label="Guest" className="hidden min-h-0 overflow-y-auto border-s border-line xl:block">
        <GuestPanel guest={guest.data} session={session} onOrder={() => setOrder(true)} onChanged={onChanged} />
      </aside>
      <TakeOrderSheet open={order} mode="phone" prefill={{ phone: session.phone, name: guest.data?.name ?? undefined }} onClose={() => setOrder(false)} />
    </div>
  );
}

function Bubble({ m }: { m: restaurantApi.ChatMessageDto }) {
  if (m.kind === "order_summary") return <SummaryCard body={m.body} />;
  const out = m.direction === "out";
  return (
    <p dir="auto" className={cn("max-w-[78%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-body", out ? "bg-fg text-bg" : "bg-bg-muted text-fg")}>
      {m.kind === "template" ? <span className="mb-0.5 block text-caption uppercase tracking-wide opacity-70">Template</span> : null}
      {m.body}
    </p>
  );
}

function SummaryCard({ body }: { body: string }) {
  let s: restaurantApi.OrderSummaryBody | null = null;
  try {
    s = JSON.parse(body) as restaurantApi.OrderSummaryBody;
  } catch {
    /* an old or malformed card: show nothing rather than crash */
  }
  if (!s) return null;
  return (
    <div className="w-full max-w-[360px] rounded-card border border-line bg-bg p-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">Order summary · #{s.orderNumber}</p>
      <ul className="mt-2 space-y-1 text-meta text-fg">
        {s.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3"><span>{l.quantity} × {l.name}</span><span className="tabular">{formatMoney(l.totalCents)}</span></li>
        ))}
        <li className="flex justify-between gap-3 text-fg-muted"><span>Tax</span><span className="tabular">{formatMoney(s.taxCents)}</span></li>
        <li className="flex justify-between gap-3 font-semibold"><span>Total</span><span className="tabular">{formatMoney(s.totalCents)}</span></li>
        {s.depositCents > 0 ? <li className="flex justify-between gap-3 font-semibold"><span>Deposit due now</span><span className="tabular">{formatMoney(s.depositCents)}</span></li> : null}
      </ul>
      {s.payUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={s.payUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 flex-1 items-center justify-center rounded-input bg-fg px-4 text-meta-strong text-bg hover:bg-brand-hover focus-visible:focus-ring">Open pay link</a>
          <CopyButton text={s.payUrl} label="Copy link" />
        </div>
      ) : (
        <p className="mt-3 text-meta text-fg-muted">Pay at pickup.</p>
      )}
    </div>
  );
}

function GuestPanel({ guest, session, onOrder, onChanged }: { guest: restaurantApi.ChatGuestPanel | null; session: whatsappApi.WhatsappSession; onOrder: () => void; onChanged: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const optOut = async () => {
    const r = await act.run(() => api.whatsapp.optOut(session.phone));
    if (r) {
      toast({ message: `${formatPhone(r.phone)} won't get WhatsApp messages from you`, tone: "success" });
      onChanged();
    }
  };
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-meta font-medium text-fg">{value}</dd>
    </div>
  );
  const first = (guest?.name ?? "").split(" ")[0] || "them";
  return (
    <div className="flex flex-col gap-4 p-5">
      <h3 className="text-meta-strong text-fg">Guest</h3>
      {!guest ? <SkeletonRows rows={3} /> : null}
      {guest ? (
        <dl className="flex flex-col gap-3.5">
          {row("Visits", guest.memberId ? `${guest.visits}${guest.lastVisitAt ? ` · last ${new Date(guest.lastVisitAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" })}` : ""}` : "Not a member yet")}
          {row("Usual", guest.usual.length ? guest.usual.map((u) => `${u.quantity} ${u.name}`).join(", ") : "No usual yet")}
          {guest.points != null ? row("Points", `${guest.points}`) : null}
          {guest.notes ? row("Notes", guest.notes) : null}
          {row("Consent", guest.consent.optedIn ? `Opted in${guest.consent.optedInAt ? ` ${whenTor(guest.consent.optedInAt).split(",")[0]}` : ""}. Messages after 9 pm are held.` : "Not opted in to offers. Order updates only.")}
          {row("Language", languageLabel(guest.language))}
        </dl>
      ) : null}
      {act.error ? <p role="alert" className="text-meta text-negative">{act.error}</p> : null}
      <Button variant="secondary" size="md" className="w-full" onClick={onOrder}>Create order for {first}</Button>
      <Button variant="secondary" size="md" className="w-full" loading={act.busy} onClick={() => void optOut()}>Record opt-out</Button>
    </div>
  );
}

export function NoChatsBanner({ connected, onSetup }: { connected: boolean; onSetup: () => void }) {
  return !connected ? (
    <Banner title="WhatsApp isn't connected yet" action={<Button size="sm" variant="secondary" onClick={onSetup}>Connect</Button>}>
      Add your WhatsApp Business number to send order updates. Guests keep messaging the same number.
    </Banner>
  ) : null;
}
