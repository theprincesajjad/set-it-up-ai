"use client";
import { useMemo, useState } from "react";
import { whatsappApi } from "@ll/shared";
import { Dot, Panel, SaveBar } from "@/components/dashboard";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CopyButton } from "@/components/dashboard/restaurant/shared";
import { OFFER_TEMPLATES, VAR_LABEL, metaTemplate } from "@/components/dashboard/restaurant/templates";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

const NAME_RE = /^[a-z0-9_]{1,512}$/;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Connection details, the approved-template checklist (with copy-paste text) and the webhook URL. */
export function Setup({ settings, onSaved }: { settings: whatsappApi.WhatsappSettings; onSaved: () => void }) {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [phoneNumberId, setPhoneNumberId] = useState(settings.phoneNumberId ?? "");
  const [displayNumber, setDisplayNumber] = useState(settings.displayNumber ?? "");
  const [approved, setApproved] = useState<string[]>(settings.approvedTemplates);
  const [other, setOther] = useState("");
  const [otherError, setOtherError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const owner = role === "owner";

  const dirty = phoneNumberId !== (settings.phoneNumberId ?? "") || displayNumber !== (settings.displayNumber ?? "") || !same(approved, settings.approvedTemplates);
  const idError = touched && phoneNumberId.trim().length < 3 ? "Enter the phone number ID from Meta (at least 3 characters)." : null;
  const toggle = (name: string, on: boolean) => setApproved((a) => (on ? [...new Set([...a, name])] : a.filter((x) => x !== name)));
  const known = useMemo(() => new Set([...settings.requiredTemplates.map((t) => t.name), ...OFFER_TEMPLATES.map((t) => t.name)]), [settings.requiredTemplates]);
  const extras = approved.filter((a) => !known.has(a));

  async function save() {
    setTouched(true);
    if (phoneNumberId.trim().length < 3) return;
    const r = await act.run(() => api.whatsapp.saveSettings({ phoneNumberId: phoneNumberId.trim(), ...(displayNumber.trim() ? { displayNumber: displayNumber.trim() } : {}), approvedTemplates: approved }));
    if (r) {
      toast({ message: "WhatsApp settings saved", tone: "success" });
      onSaved();
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <Panel
        title="Your WhatsApp Business number"
        description="Connect the number through Meta's WhatsApp Business Platform. Customers keep messaging the number they already know."
        action={settings.connected ? <Dot tone="positive">Connected</Dot> : <Dot>Not connected</Dot>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone number ID" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} disabled={!owner} autoComplete="off" error={idError} hint="From Meta: WhatsApp Manager, then API setup. This is an ID, not your phone number." />
          <TextField label="Number customers see" type="tel" inputMode="tel" placeholder="+1 416 555 0123" value={displayNumber} onChange={(e) => setDisplayNumber(e.target.value)} disabled={!owner} optionalLabel hint="Shown on receipts and the pay link." />
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <p className="text-meta-strong text-fg">Webhook URL</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full break-all rounded-input bg-bg-subtle px-2.5 py-1.5 text-meta text-fg">{settings.webhookUrl}</code>
            <CopyButton text={settings.webhookUrl} label="Copy URL" />
          </div>
          <p className="text-meta text-fg-muted">Paste this as the callback URL for your Meta app&apos;s WhatsApp webhook, and subscribe to messages.</p>
        </div>
        {!owner ? <p className="mt-4 text-meta text-fg-muted">Only the shop owner can change the connection.</p> : null}
        {settings.connected && owner ? (
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDisconnect(true)}>
              Disconnect this number
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="Order update templates" description="WhatsApp only lets a shop start a chat with a template Meta has approved. Create each one in WhatsApp Manager, under Message templates. The name has to match exactly. Tick it here once it shows as approved.">
        <ul className="divide-y divide-line border-y border-line">
          {settings.requiredTemplates.map((t) => (
            <li key={t.kind} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <Checkbox checked={approved.includes(t.name)} onChange={(v) => toggle(t.name, v)} disabled={!owner} label={<code className="text-body">{t.name}</code>} caption={`Variables: ${whatsappApi.WA_TEMPLATE_NAMES[t.kind].params.map((p, i) => `{{${i + 1}}} ${p.replace(/_/g, " ")}`).join(", ")}`} />
                <CopyButton text={t.example} label="Copy text" />
              </div>
              <p className="ps-9 text-meta text-fg">{t.example}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Offer templates for broadcasts" description="Festival and offer wording you can submit to Meta. Approved ones can be picked in the Broadcast tab. Edit the wording to sound like your shop before you submit it.">
        <details className="group">
          <summary className="cursor-pointer text-meta font-medium text-fg focus-visible:focus-ring">
            Show the {OFFER_TEMPLATES.length} suggested templates ({OFFER_TEMPLATES.filter((o) => approved.includes(o.name)).length} ticked)
          </summary>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {OFFER_TEMPLATES.map((o) => {
              const m = metaTemplate(o.template.whatsapp);
              return (
                <li key={o.name} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Checkbox checked={approved.includes(o.name)} onChange={(v) => toggle(o.name, v)} disabled={!owner} label={<code className="text-body">{o.name}</code>} caption={`${o.festival.name}: ${o.template.label}`} />
                    <CopyButton text={m.text} label="Copy text" />
                  </div>
                  <p className="ps-9 text-meta text-fg">{m.text}</p>
                  <p className="ps-9 text-caption text-fg-muted">{m.vars.map((v, i) => `{{${i + 1}}} is ${VAR_LABEL[v] ?? v}`).join(" · ")}</p>
                </li>
              );
            })}
          </ul>
        </details>
        <div className="mt-4 flex flex-col gap-2">
          {extras.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Other approved templates">
              {extras.map((n) => (
                <li key={n} className="inline-flex h-8 items-center gap-2 rounded-full border border-line ps-3 pe-1 text-meta">
                  <code>{n}</code>
                  <button type="button" disabled={!owner} aria-label={`Remove ${n}`} onClick={() => toggle(n, false)} className="inline-flex size-6 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle focus-visible:focus-ring">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField label="Another approved template" placeholder="diwali_mithai_2026" value={other} onChange={(e) => { setOther(e.target.value.toLowerCase()); setOtherError(null); }} disabled={!owner} error={otherError} hint="Lowercase letters, numbers and underscores, exactly as Meta shows it." />
            </div>
            <Button
              variant="secondary"
              className="mt-[26px]"
              disabled={!owner || !other}
              onClick={() => {
                if (!NAME_RE.test(other)) return setOtherError("Use lowercase letters, numbers and underscores only.");
                toggle(other, true);
                setOther("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </Panel>

      <SaveBar dirty={dirty && owner} error={act.error} onDiscard={() => { setPhoneNumberId(settings.phoneNumberId ?? ""); setDisplayNumber(settings.displayNumber ?? ""); setApproved(settings.approvedTemplates); setTouched(false); act.setError(null); }}>
        <Button size="sm" loading={act.busy} onClick={() => void save()}>
          Save changes
        </Button>
      </SaveBar>
      <ConfirmDialog
        open={disconnect}
        onClose={() => setDisconnect(false)}
        title="Disconnect WhatsApp?"
        body="Order updates and broadcasts stop until you connect a number again. Your approved templates stay saved."
        confirmLabel="Disconnect"
        danger
        onConfirm={async () => {
          await api.whatsapp.disconnect();
          toast({ message: "WhatsApp disconnected", tone: "success" });
          onSaved();
        }}
      />
    </div>
  );
}
