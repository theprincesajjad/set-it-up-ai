"use client";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { WA_LANGUAGES, LOCALES, type messagingApi, type whatsappApi } from "@ll/shared";
import { EmptyState, Panel, QuietButton, DefList } from "@/components/dashboard";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CopyButton, TierTeaser } from "@/components/dashboard/restaurant/shared";
import { findOfferTemplate, metaTemplate } from "@/components/dashboard/restaurant/templates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";

type SegKind = messagingApi.Segment["kind"];
const SEGMENTS: { value: SegKind; label: string }[] = [
  { value: "all", label: "Everyone who opted in to WhatsApp" },
  { value: "vip", label: "VIP members" },
  { value: "lapsed", label: "Haven't visited in 30 days" },
  { value: "reward_ready", label: "Reward ready" },
  { value: "new", label: "New in the last 14 days" },
  { value: "tag", label: "Customers with a tag" },
];

function segmentOf(kind: SegKind, tag: string): messagingApi.Segment {
  if (kind === "lapsed") return { kind, days: 30 };
  if (kind === "new") return { kind, days: 14 };
  if (kind === "tag") return { kind, tag: tag.trim() || "x" };
  if (kind === "vip") return { kind };
  return { kind: kind as "all" | "reward_ready" };
}

/** Broadcast composer: pick an approved template, fill its variables, preview who gets it (dry run), then send. */
export function Broadcast({ settings, loading, onSetup }: { settings: whatsappApi.WhatsappSettings | null; loading: boolean; onSetup: () => void }) {
  const { api, base } = useMerchant();
  const params = useSearchParams();
  // A festival card sends people here with ?template=&festival=&tpl=&year=&p=... (see festivals page).
  const prefillName = params.get("template");
  const festivalId = params.get("festival");
  const tplId = params.get("tpl");
  const reference = useMemo(() => {
    const o = prefillName ? findOfferTemplate(prefillName) : null;
    return o && (!festivalId || o.festival.id === festivalId) ? (tplId ? (o.festival.templates.find((t) => t.id === tplId) ?? o.template) : o.template) : null;
  }, [prefillName, festivalId, tplId]);

  const [template, setTemplate] = useState(prefillName ?? "");
  const [language, setLanguage] = useState<whatsappApi.WaLanguage>("en");
  const [vars, setVars] = useState<string[]>(() => params.getAll("p"));
  const [seg, setSeg] = useState<SegKind>("all");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<whatsappApi.BroadcastResult | null>(null);
  const [sent, setSent] = useState<whatsappApi.BroadcastResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (loading || !settings) return <div className="skeleton h-64 w-full rounded-card" aria-busy="true" aria-label="Loading" />;
  if (!settings.features.marketing) return <TierTeaser inline featureKey="restaurant.whatsapp_marketing" />;
  if (!settings.connected || !settings.approvedTemplates.length)
    return (
      <EmptyState
        title={settings.connected ? "No approved templates yet" : "Connect WhatsApp first"}
        description="Broadcasts use templates Meta has approved. Add your number and tick the templates you have approved in Setup."
        action={
          <Button size="sm" variant="secondary" onClick={onSetup}>
            Go to Setup
          </Button>
        }
      />
    );

  const options = settings.approvedTemplates.map((t) => ({ value: t, label: t }));
  const chosen = template && settings.approvedTemplates.includes(template) ? template : "";
  const unapproved = !!prefillName && !settings.approvedTemplates.includes(prefillName);
  const invalidate = () => {
    setPreview(null);
    setSent(null);
    setError(null);
    setErrorCode(null);
  };
  const body = (dryRun: boolean): whatsappApi.BroadcastBody => ({ templateName: chosen, language, params: vars.map((v) => v.trim()).filter(Boolean), segment: segmentOf(seg, tag), dryRun });
  const ready = !!chosen && (seg !== "tag" || !!tag.trim());

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "send");
    setError(null);
    setErrorCode(null);
    try {
      const r = await api.whatsapp.broadcast(body(dryRun));
      if (dryRun) setPreview(r);
      else {
        setSent(r);
        setPreview(null);
      }
    } catch (e) {
      setError(errorMessage(e));
      setErrorCode(isApiError(e) ? e.code : null);
    } finally {
      setBusy(null);
    }
  }

  const short = preview ? preview.creditsNeeded > preview.creditsRemaining : false;
  const meta = reference ? metaTemplate(reference.whatsapp) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="New broadcast" description="Goes only to customers who opted in to WhatsApp from you and agreed to marketing. Everyone else is left out automatically.">
          <div className="flex flex-col gap-4">
            {unapproved ? (
              <Banner tone="warning" title={`"${prefillName}" isn't approved yet`} action={<Button size="sm" variant="secondary" onClick={onSetup}>Open Setup</Button>}>
                Submit it in Meta Business Manager, then tick it in Setup. You can pick another approved template meanwhile.
              </Banner>
            ) : null}
            <Select label="Template" value={chosen} placeholder="Choose an approved template" options={options} onChange={(e) => { setTemplate(e.target.value); invalidate(); }} />
            <Select label="Language" value={language} options={WA_LANGUAGES.map((l) => ({ value: l, label: `${LOCALES[l].name} (${LOCALES[l].englishName})` }))} onChange={(e) => { setLanguage(e.target.value as whatsappApi.WaLanguage); invalidate(); }} hint="Must match the language the template was approved in." />
            <fieldset className="flex flex-col gap-3">
              <legend className="text-meta-strong text-fg">Template variables</legend>
              <p className="text-meta text-fg-muted">In order: the first box fills {"{{1}}"}, the second {"{{2}}"}. Use {"{{first_name}}"} and {"{{merchant}}"} and we fill in each customer&apos;s own.</p>
              {vars.map((v, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField label={`Variable ${i + 1}`} value={v} maxLength={200} onChange={(e) => { setVars((a) => a.map((x, j) => (j === i ? e.target.value : x))); invalidate(); }} />
                  </div>
                  <button type="button" aria-label={`Remove variable ${i + 1}`} onClick={() => { setVars((a) => a.filter((_, j) => j !== i)); invalidate(); }} className="mb-[22px] inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
              {vars.length < 10 ? (
                <QuietButton className="self-start" onClick={() => setVars((a) => [...a, ""])}>
                  <Plus aria-hidden className="size-3.5" /> Add a variable
                </QuietButton>
              ) : null}
            </fieldset>
            <Select label="Who gets it" value={seg} options={SEGMENTS} onChange={(e) => { setSeg(e.target.value as SegKind); invalidate(); }} />
            {seg === "tag" ? <TextField label="Tag" value={tag} onChange={(e) => { setTag(e.target.value); invalidate(); }} /> : null}
          </div>
        </Panel>

        {error ? (
          <Banner tone="danger" title={errorCode === "whatsapp_credits_exhausted" ? "Not enough WhatsApp messages left" : undefined} action={errorCode === "whatsapp_credits_exhausted" ? <Button size="sm" variant="secondary" href={`${base}/billing`}>Buy a pack</Button> : undefined}>
            {error}
          </Banner>
        ) : null}

        {preview ? (
          <Panel title="Who would get this" description="This was a preview. Nothing has been sent.">
            <p className="text-[30px] font-semibold leading-9 tracking-[-0.01em] tabular text-fg" role="status">
              {formatNumber(preview.recipients)} <span className="text-body font-normal text-fg-muted">{preview.recipients === 1 ? "person" : "people"}</span>
            </p>
            <DefList
              className="mt-3"
              items={[
                { label: "Matched your audience", value: formatNumber(preview.matched) },
                { label: "Left out: no marketing consent", value: formatNumber(preview.excludedNoConsent) },
                { label: "Left out: not opted in to WhatsApp", value: formatNumber(preview.excludedNoWhatsappOptIn) },
                { label: "Left out: muted your shop", value: formatNumber(preview.excludedMuted) },
                { label: "Messages this uses", value: `${formatNumber(preview.creditsNeeded)} of ${formatNumber(preview.creditsRemaining)} left` },
              ]}
            />
            {short ? (
              <Banner className="mt-3" tone="warning" action={<Button size="sm" variant="secondary" href={`${base}/billing`}>Buy a pack</Button>}>
                You need {formatNumber(preview.creditsNeeded - preview.creditsRemaining)} more messages for this send.
              </Banner>
            ) : null}
            {preview.recipients === 0 ? <p className="mt-3 text-meta text-fg-muted">No one in this audience can get a WhatsApp marketing message yet. Record opt-ins from the Chats tab as customers agree.</p> : null}
          </Panel>
        ) : null}
        {sent ? (
          <Banner tone={sent.failed ? "warning" : "success"} title={`Sent to ${formatNumber(sent.sent)} ${sent.sent === 1 ? "person" : "people"}`}>
            {sent.failed ? `${formatNumber(sent.failed)} didn't go through and weren't counted against your messages. ` : ""}
            {sent.sent === 0 && sent.recipients === 0 ? "No one in this audience has opted in, so nothing was sent. " : ""}
            {formatNumber(sent.creditsRemaining)} messages left this month.
          </Banner>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!ready || busy === "send"} loading={busy === "preview"} onClick={() => void run(true)}>
            Preview who gets it
          </Button>
          <Button disabled={!ready || !preview || preview.recipients === 0 || short} loading={busy === "send"} onClick={() => setConfirm(true)}>
            {preview && preview.recipients > 0 ? `Send to ${formatNumber(preview.recipients)}` : "Send"}
          </Button>
        </div>
        {!preview && ready ? <p className="text-meta text-fg-muted">Preview first. Send turns on once you have seen how many people it reaches.</p> : null}
      </div>

      <aside aria-label="About broadcasts" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <Panel title="Quiet hours" padded>
          <p className="text-meta text-fg-muted">
            Offers only go out between 8 a.m. and 9 p.m. in your local time, so nobody gets a buzz at midnight. You can preview any time. If you try to send outside those hours, we hold it and tell you to try again in the morning.
          </p>
        </Panel>
        {reference && meta ? (
          <Panel title={reference.label} description="Suggested wording for this template. Submit it to Meta as is, then tick it in Setup.">
            <pre className="whitespace-pre-wrap font-sans text-meta text-fg">{meta.text}</pre>
            <div className="mt-3">
              <CopyButton text={meta.text} label="Copy template text" />
            </div>
          </Panel>
        ) : null}
        <p className="text-meta text-fg-muted">
          Replies from customers open a 24-hour window for free-form chat. See who is in one under{" "}
          <Link className="font-medium text-fg underline decoration-line underline-offset-4" href={`${base}/restaurant/whatsapp`}>
            Chats
          </Link>
          .
        </p>
      </aside>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Send to ${formatNumber(preview?.recipients ?? 0)} ${preview?.recipients === 1 ? "person" : "people"} now?`}
        body={`This uses ${formatNumber(preview?.creditsNeeded ?? 0)} WhatsApp messages and can't be unsent.`}
        confirmLabel="Send now"
        onConfirm={() => run(false)}
      />
    </div>
  );
}
