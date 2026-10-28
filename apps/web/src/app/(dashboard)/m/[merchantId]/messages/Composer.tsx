"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PHARMACY_CHECK_NOTE_EN, beautyClaimMessage, checkBeautyClaims, checkPharmacyText, isBeautySupplyVertical, messagingApi, pharmacyTextMessage } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { firstName, formatNumber } from "@/lib/format";
import { rewardNoun } from "@/lib/dashboard/home";
import { AUDIENCES, QUIET_HOURS_LABEL, audienceFromParam, chipLabel, defaultBody, defaultSendTime, inQuiet, renderPreview, sendLabel, smsCountLine, smsLength, toApiBody, type AudienceKey } from "@/lib/dashboard/messages";
import { fromLocalInput } from "@/lib/dashboard/time";

type When = "now" | "at" | "pick";

/**
 * New message (cafes-retail.md 7.5): who gets it (chips with the count that can be reached on this channel), how, the text
 * with the footer the server adds shown read-only, when, a test to yourself. Text is the default when SMS is on.
 */
export function Composer({ onSent }: { onSent?: () => void }) {
  const { api, base, detail, enabled } = useMerchant();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const sms = enabled("marketing.sms");
  const email = enabled("marketing.email");
  const m = detail.merchant;
  const address = detail.locations[0]?.address ?? null;
  const noun = rewardNoun(m.vertical);
  const [channel, setChannel] = useState<messagingApi.Channel>(sms ? "sms" : "email");
  const [aud, setAud] = useState<AudienceKey>(audienceFromParam(params.get("segment")));
  const [more, setMore] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<AudienceKey, number>>>({});
  const [body, setBody] = useState(() => params.get("body") ?? defaultBody(audienceFromParam(params.get("segment")), noun));
  const touched = useRef(!!params.get("body"));
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [when, setWhen] = useState<When>("at");
  const [pickAt, setPickAt] = useState("");
  const [nowMs] = useState(() => Date.now());
  const slot = useMemo(() => defaultSendTime(new Date(nowMs)), [nowMs]);
  const [who, setWho] = useState({ firstName: "Sam", balance: 7 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [usage, setUsage] = useState<messagingApi.SmsUsage | null>(null);
  // Pharmacy: a message can only be about the front store. Checked as you type (the server checks again on create, edit and send).
  const rxCheck = m.vertical === "pharmacy" ? checkPharmacyText(`${channel === "sms" ? "" : subject}\n${body}`) : { ok: true as const };
  // Beauty supply: no treatment claims (Health Canada treats a cosmetic with one as a drug). Same pattern, same server check.
  const claimCheck = isBeautySupplyVertical(m.vertical) ? checkBeautyClaims(`${channel === "sms" ? "" : subject}\n${body}`) : { ok: true as const, term: undefined };
  const segment = AUDIENCES.find((a) => a.key === aud)!.segment;
  const selected = counts[aud] ?? null;
  const term = detail.program?.terminology ?? "stamps";

  // Nobody picked an audience yet: start on the first one that has people in it (an empty "Slipping away" is a dead start).
  const picked = useRef(!!params.get("segment"));
  const chosen = (k: AudienceKey, byHand = true) => {
    if (byHand) picked.current = true;
    setAud(k);
    if (!touched.current) setBody(defaultBody(k, noun));
    setDraftId(null);
  };

  // Counts for every chip on this channel (CASL: only people who agreed and can be reached this way).
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void Promise.all(AUDIENCES.map((a) => api.messages.audience({ channel, segment: a.segment }).then((r) => [a.key, r.recipients] as const).catch(() => [a.key, null] as const))).then((rows) => {
        if (!live) return;
        const next = Object.fromEntries(rows.filter((r) => r[1] != null)) as Partial<Record<AudienceKey, number>>;
        setCounts(next);
        if (!picked.current) {
          const first = AUDIENCES.find((a) => (next[a.key] ?? 0) > 0);
          if (first && (next[aud] ?? 0) === 0) chosen(first.key, false);
        }
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the first-audience pick reads aud/chosen once per channel load
  }, [api, channel]);

  useEffect(() => {
    if (!sms) return;
    void api.messages.smsUsage().then(setUsage).catch(() => undefined);
  }, [api, sms]);

  // A real member's first name in the preview.
  useEffect(() => {
    let live = true;
    const q: Record<string, string | number> = { limit: 1 };
    if (aud === "slipping") q.segment = "slipping";
    else if (aud === "regulars") q.segment = "regulars";
    else if (aud === "reward_ready") q.rewardAvailable = "true";
    else q.consent = "opted_in";
    void api
      .customers(q)
      .then((r) => {
        const c = r.items[0];
        if (live && c?.name) setWho({ firstName: firstName(c.name), balance: c.balance });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, aud]);

  const recipients = selected ?? 0;
  const text = channel === "sms" ? "text" : channel === "email" ? "email" : "message";
  const mode = when;
  const scheduledAt = mode === "now" ? null : mode === "at" ? slot.at.toISOString() : fromLocalInput(pickAt);
  const smsLen = smsLength(body, m.name, address);
  const footer = messagingApi.smsFooterText(m.name, address);
  const pickedQuiet = mode === "pick" && pickAt ? inQuiet(new Date(fromLocalInput(pickAt) ?? "")) : false;

  const submit = useCallback(
    async (kind: "send" | "draft") => {
      if (channel === "email" && !subject.trim()) return setError("Add a subject line.");
      if (!body.trim()) return setError("Write your message.");
      if (kind === "send" && mode === "pick" && !pickAt) return setError("Pick when to send it.");
      if (kind === "send" && !recipients) return setError("No one in this audience can get it yet.");
      setBusy(true);
      setError(null);
      try {
        const content = { channel, subject: subject.trim() || null, body: toApiBody(body.trim()), segment };
        const sendNow = kind === "send" && mode === "now";
        const at = kind === "send" && mode !== "now" ? scheduledAt : null;
        let res: messagingApi.MessageDetail;
        if (draftId) {
          res = await api.messages.update(draftId, { ...content, ...(at ? { scheduledAt: at } : {}) });
          if (sendNow) res = await api.messages.send(draftId);
        } else {
          res = await api.messages.create({ ...content, subject: content.subject ?? undefined, sendNow, scheduledAt: at ?? undefined });
        }
        toast({ message: kind === "draft" ? "Draft saved" : res.status === "sent" ? `Sent to ${formatNumber(res.recipientCount)} people` : `Scheduled for ${formatNumber(recipients)} people`, tone: "success" });
        onSent?.();
        router.push(`${base}/messages/${res.id}`);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [api, base, body, channel, draftId, mode, onSent, pickAt, recipients, router, scheduledAt, segment, subject, toast],
  );

  async function sendTest() {
    if (channel === "email" && !subject.trim()) return setError("Add a subject line.");
    if (!body.trim()) return setError("Write your message.");
    setTesting(true);
    setError(null);
    setTestNote(null);
    try {
      const content = { channel, subject: subject.trim() || null, body: toApiBody(body.trim()), segment };
      const id = draftId ?? (await api.messages.create({ ...content, subject: content.subject ?? undefined, sendNow: false })).id;
      if (draftId) await api.messages.update(draftId, content);
      setDraftId(id);
      const r = await api.messages.sendTest(id);
      setTestNote(`Test sent to ${r.to.join(", ")}${r.smsCreditsUsed ? " (used 1 text)" : ""}. Saved as a draft. ${r.testsRemainingToday} tests left today.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  const chip = (a: (typeof AUDIENCES)[number]) => {
    const on = a.key === aud;
    return (
      <button
        key={a.key}
        type="button"
        aria-pressed={on}
        onClick={() => chosen(a.key)}
        className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:focus-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
      >
        {chipLabel(a, counts[a.key] ?? null, on, channel)}
      </button>
    );
  };

  const previewText = renderPreview(body || "Your message", { firstName: who.firstName, balance: who.balance, terminology: term }, m.name);
  const channels: { value: messagingApi.Channel; label: string }[] = [...(sms ? [{ value: "sms" as const, label: "Text" }] : []), ...(email ? [{ value: "email" as const, label: "Email" }] : []), ...(email ? [{ value: "push" as const, label: "Wallet pass message" }] : [])];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="new-message-h" className="flex min-w-0 flex-col gap-4 rounded-card bg-card shadow-card p-6">
        <h2 id="new-message-h" className="text-[18px] font-semibold text-fg">New message</h2>
        <div className="flex flex-col gap-2.5">
          <p id="who-l" className="text-[14px] font-medium text-fg">Who gets it</p>
          <div role="group" aria-labelledby="who-l" className="flex flex-wrap gap-2">
            {AUDIENCES.filter((a) => !a.more || more || a.key === aud).map(chip)}
            {!more ? (
              <button type="button" onClick={() => setMore(true)} className="h-9 rounded-full px-3 text-[13px] font-medium text-fg-muted hover:text-fg focus-visible:focus-ring">
                More audiences
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <p id="how-l" className="text-[14px] font-medium text-fg">How</p>
          <div role="radiogroup" aria-labelledby="how-l" className="inline-flex self-start rounded-[12px] bg-bg-subtle p-1">
            {channels.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={channel === c.value}
                onClick={() => {
                  setChannel(c.value);
                  setDraftId(null);
                }}
                className={cn("h-9 rounded-[9px] px-4 text-[14px] transition-colors focus-visible:focus-ring", channel === c.value ? "bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--ll-color-line)]" : "text-fg-muted hover:text-fg")}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {channel !== "sms" ? <TextField label={channel === "push" ? "Title" : "Subject"} optionalLabel={channel === "push"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} /> : null}
        {m.vertical === "pharmacy" ? <p className="text-caption text-fg-muted" data-testid="pharmacy-check-note">{PHARMACY_CHECK_NOTE_EN}</p> : null}
        {!rxCheck.ok ? (
          <div role="alert" data-testid="pharmacy-text-blocked" className="rounded-input bg-negative/10 p-3 text-meta text-fg">
            <p className="font-semibold text-negative">This can&apos;t be sent</p>
            <p className="mt-1">{pharmacyTextMessage(rxCheck, "Your message")} To tell someone an order is ready, use Pickup ready at the counter.</p>
          </div>
        ) : null}
        {!claimCheck.ok ? (
          <div role="alert" data-testid="beauty-claims-blocked" className="rounded-input bg-negative/10 p-3 text-meta text-fg">
            <p className="font-semibold text-negative">This can&apos;t be sent</p>
            <p className="mt-1">{beautyClaimMessage(claimCheck, "Your message")}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor="msg-body" className="text-[14px] font-medium text-fg">Message</label>
          <div className="rounded-[14px] border border-line px-4 py-3.5 focus-within:border-fg">
            <textarea
              id="msg-body"
              rows={3}
              ref={(el) => {
                // Grow with the text so a long message is never hidden behind a scroll on a phone.
                if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
              }}
              value={body}
              maxLength={channel === "sms" ? messagingApi.SMS_MAX_BODY : channel === "push" ? messagingApi.PUSH_MAX_BODY : messagingApi.EMAIL_MAX_BODY}
              onChange={(e) => {
                touched.current = true;
                setBody(e.target.value);
              }}
              className="block w-full resize-y bg-transparent text-[15px] leading-6 text-fg outline-none"
            />
            {channel === "sms" ? (
              <>
                {/* Read only: the footer is added by the server and cannot be edited or removed (CASL). */}
                <p data-testid="sms-footer" className="mt-2 text-[13px] leading-5 text-fg-muted">Added for you: {footer}</p>
                <p className="mt-1.5 text-[12px] text-fg-muted">{smsCountLine(smsLen)}</p>
              </>
            ) : (
              <p className="mt-2 text-[13px] leading-5 text-fg-muted">
                {channel === "email" ? `Added for you: ${m.name}${address ? `, ${address}` : ""} and an unsubscribe link.` : `Added for you: ${m.name} and how to mute this shop.`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <p id="when-l" className="text-[14px] font-medium text-fg">When</p>
          <div role="radiogroup" aria-labelledby="when-l" className="flex flex-wrap items-center gap-2">
            {(
              [
                { v: "at" as const, label: slot.label },
                { v: "now" as const, label: "Now" },
                { v: "pick" as const, label: "Pick a time" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={when === o.v}
                onClick={() => setWhen(o.v)}
                className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:focus-ring", when === o.v ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
              >
                {o.label}
              </button>
            ))}
            {channel === "sms" ? <span className="text-[13px] text-fg-muted">Texts only go out {QUIET_HOURS_LABEL}</span> : null}
          </div>
          {when === "pick" ? <TextField type="datetime-local" label="Send at" hint="Toronto time" value={pickAt} onChange={(e) => setPickAt(e.target.value)} className="sm:max-w-64" /> : null}
          {channel === "sms" && (pickedQuiet || (when === "now" && inQuiet(new Date(nowMs)))) ? <p className="text-[13px] text-fg-muted">That is in quiet hours, so it waits and goes out at 8 am.</p> : null}
        </div>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {testNote ? <Banner tone="success">{testNote}</Banner> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[13px] text-fg-muted">
            {recipients} {text}{recipients === 1 ? "" : "s"}
            {channel === "sms" && usage ? ` · uses ${recipients} of your ${usage.remaining}` : ""}
          </span>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" size="md" loading={testing} disabled={busy} onClick={() => void sendTest()} className="rounded-full px-5 text-[14px]">
              Send me a test
            </Button>
            <Button size="md" loading={busy} disabled={!recipients || !rxCheck.ok || !claimCheck.ok} onClick={() => setConfirm(true)} className="rounded-full px-5 text-[14px]">
              {sendLabel(mode, recipients, channel)}
            </Button>
          </div>
        </div>
        <div>
          <button type="button" disabled={busy} onClick={() => void submit("draft")} className="text-[13px] font-medium text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:focus-ring">
            Save as a draft
          </button>
        </div>
      </section>

      <aside aria-label="Preview" className="flex h-fit flex-col gap-3 rounded-[24px] bg-bg-subtle p-5 lg:sticky lg:top-20">
        <h2 className="text-[13px] text-fg-muted">Preview</h2>
        <div className="rounded-[18px] bg-bg-muted px-4 py-3.5 text-[14px] leading-[20px] text-fg">
          <p className="mb-1 text-[11px] font-semibold text-fg-muted">{m.name}</p>
          <p className="whitespace-pre-wrap">{previewText}</p>
          {channel === "sms" ? <p className="mt-1 whitespace-pre-wrap">{`${m.name}${address ? `, ${address}` : ""} · Reply STOP to unsubscribe`}</p> : null}
        </div>
        <p className="text-[12px] text-fg-muted">Shown with a real member&apos;s first name</p>
      </aside>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${mode === "now" ? "Send" : "Schedule"} ${formatNumber(recipients)} ${text}${recipients === 1 ? "" : "s"}?`}
        body={mode === "now" ? "It goes out right away and can't be unsent. Only people who agreed get it." : "It goes out at the time you picked. You can cancel it until then. Only people who agreed get it."}
        confirmLabel={mode === "now" ? "Send now" : "Schedule"}
        onConfirm={() => submit("send")}
      />
    </div>
  );
}
