"use client";
import { BackLink, PageHeader, Panel, Segmented } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { messagingApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { BRAND } from "@ll/shared";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";
import { fromLocalInput } from "@/lib/dashboard/time";

type SegKind = messagingApi.Segment["kind"];
const SEGMENTS: { value: SegKind; label: string }[] = [
  { value: "all", label: "Everyone who opted in" },
  { value: "vip", label: "VIP members" },
  { value: "lapsed", label: "At risk (no visit in 30 days)" },
  { value: "reward_ready", label: "Reward ready" },
  { value: "new", label: "New (last 14 days)" },
  { value: "tag", label: "Customers with a tag" },
];

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function ComposePageGated() {
  return (
    <FeatureGate keys={["marketing.email", "marketing.sms"]} title="Email & SMS campaigns">
      <ComposePage />
    </FeatureGate>
  );
}

function ComposePage() {
  const { api, base, detail, enabled } = useMerchant();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [channel, setChannel] = useState<messagingApi.Channel>("email");
  const [seg, setSeg] = useState<SegKind>("all");
  const [tag, setTag] = useState("");
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [body, setBody] = useState(params.get("body") ?? "");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [count, setCount] = useState<messagingApi.AudiencePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  /** Set once "Send test to me" saved a draft; later saves update it instead of creating another. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const segment: messagingApi.Segment = seg === "lapsed" ? { kind: "lapsed", days: 30 } : seg === "new" ? { kind: "new", days: 14 } : seg === "tag" ? { kind: "tag", tag: tag || "x" } : seg === "vip" ? { kind: "vip" } : { kind: seg as "all" | "reward_ready" };
  const max = channel === "sms" ? messagingApi.SMS_MAX_BODY : channel === "push" ? messagingApi.PUSH_MAX_BODY : messagingApi.EMAIL_MAX_BODY;
  const loc = detail.locations[0];

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.messages.audience({ channel, segment }).then((r) => live && setCount(r)).catch(() => live && setCount(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, channel, seg, tag]);

  async function submit(mode: "draft" | "send" | "schedule") {
    if (channel === "email" && !subject.trim()) return setError("Add a subject line.");
    if (!body.trim()) return setError("Write your message.");
    if (mode === "schedule" && !at) return setError("Pick when to send it.");
    setBusy(true);
    setError(null);
    try {
      let m: messagingApi.MessageDetail;
      if (draftId) {
        m = await api.messages.update(draftId, { channel, subject: subject.trim() || null, body: body.trim(), segment, ...(mode === "schedule" ? { scheduledAt: fromLocalInput(at) } : {}) });
        if (mode === "send") m = await api.messages.send(draftId);
      } else {
        m = await api.messages.create({ channel, subject: subject.trim() || undefined, body: body.trim(), segment, sendNow: mode === "send", scheduledAt: mode === "schedule" ? fromLocalInput(at) : undefined });
      }
      toast({ message: mode === "send" ? `Sent to ${formatNumber(m.recipientCount)} people` : mode === "schedule" ? "Scheduled" : "Draft saved", tone: "success" });
      router.push(`${base}/messages/${m.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (channel === "email" && !subject.trim()) return setError("Add a subject line.");
    if (!body.trim()) return setError("Write your message.");
    setTesting(true);
    setError(null);
    setTestNote(null);
    try {
      const content = { channel, subject: subject.trim() || null, body: body.trim(), segment };
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

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/messages`}>Messages</BackLink>
      <PageHeader title="New message" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="flex flex-col gap-4">
            <Segmented className="self-start" label="Channel" value={channel} onChange={setChannel} options={[{ value: "email", label: "Email" }, { value: "push", label: "App push" }, ...(enabled("marketing.sms") ? [{ value: "sms" as const, label: "SMS" }] : [])]} />
            <Select label="Audience" value={seg} onChange={(e) => setSeg(e.target.value as SegKind)} options={SEGMENTS} />
            {seg === "tag" ? <TextField label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} /> : null}
            <p role="status" className="border-y border-line py-3 text-meta text-fg">
              {count ? `Will go to ${formatNumber(count.recipients)} ${count.recipients === 1 ? "person" : "people"}` : "Counting..."}
              {count && count.matched > count.recipients ? <span className="block text-meta text-fg-muted">{formatNumber(count.excludedNoConsent)} without consent, {formatNumber(count.excludedMuted)} muted and {formatNumber(count.excludedNoContact)} unreachable won&apos;t get it.</span> : null}
              {count && channel === "sms" ? <span className="block text-meta text-fg-muted">Uses {formatNumber(count.smsCreditsNeeded)} of {formatNumber(count.smsCreditsRemaining ?? 0)} texts left this month.</span> : null}
            </p>
            {channel !== "sms" ? <TextField label={channel === "push" ? "Title" : "Subject"} optionalLabel={channel === "push"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} /> : null}
            <TextField type="textarea" label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={max} showCount hint={`Personalise with ${messagingApi.MESSAGE_VARIABLES.slice(0, 3).join(", ")}.`} />
            <Segmented className="self-start" label="When" value={when} onChange={setWhen} options={[{ value: "now", label: "Send now" }, { value: "later", label: "Schedule" }]} />
            {when === "later" ? <TextField type="datetime-local" label="Send at" hint="Toronto time" value={at} onChange={(e) => setAt(e.target.value)} /> : null}
            {error ? <Banner tone="danger">{error}</Banner> : null}
            {testNote ? <Banner tone="success">{testNote}</Banner> : null}
            <div className="flex flex-wrap gap-2">
              {when === "now" ? (
                <Button loading={busy} onClick={() => (count?.recipients ? setConfirm(true) : setError("No one in this audience can get it yet."))}>
                  Send now
                </Button>
              ) : (
                <Button loading={busy} onClick={() => submit("schedule")}>
                  Schedule
                </Button>
              )}
              <Button variant="secondary" disabled={busy} onClick={() => submit("draft")}>
                Save draft
              </Button>
              <Button variant="ghost" iconStart={Send} loading={testing} disabled={busy} onClick={() => void sendTest()}>
                Send test to me
              </Button>
            </div>
          </Panel>
        </div>
        <aside aria-label="Preview" className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
          <h2 className="text-meta text-fg-muted">Preview</h2>
          <div className="overflow-hidden rounded-card border border-line bg-bg">
            {channel === "email" ? (
              <div className="border-b border-line bg-bg-subtle px-4 py-2 text-meta text-fg">
                <p><span className="text-fg-muted">From:</span> {detail.merchant.name}</p>
                <p><span className="text-fg-muted">Subject:</span> {subject || "Your subject"}</p>
              </div>
            ) : null}
            <div className="whitespace-pre-wrap p-4 text-body text-fg">{(body || "Your message").replace(/\{\{first_name\}\}/g, "Sam").replace(/\{\{name\}\}/g, "Sam Lee").replace(/\{\{merchant\}\}/g, detail.merchant.name)}</div>
            <div className="border-t border-dashed border-line-strong bg-bg-subtle px-4 py-3 text-caption text-fg-muted">
              <p className="mb-1 font-semibold text-fg">Added automatically</p>
              {channel === "sms" ? `— ${detail.merchant.name}. Reply STOP to opt out.` : channel === "push" ? `(${detail.merchant.name} · mute this shop in the app to stop offers)` : `${detail.merchant.name}${loc ? ` · ${loc.address}` : ""} · You're getting this because you said yes to offers from ${detail.merchant.name}. Unsubscribe · Sent via ${BRAND.name}.`}
            </div>
          </div>
        </aside>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Send to ${formatNumber(count?.recipients ?? 0)} people now?`} body="It goes out right away and can't be unsent." confirmLabel="Send now" onConfirm={() => submit("send")} />
    </div>
  );
}
