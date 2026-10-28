"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatFestivalDate, type FestivalDef, type FestivalTemplate } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { festivalParams } from "@/components/dashboard/restaurant/templates";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAction } from "@/lib/dashboard/useApi";

type Channel = "email" | "sms" | "push" | "whatsapp";

/** Fill the template placeholders with example values so the shop sees roughly what customers read. */
export function previewText(text: string, shop: string, startDate: string): string {
  return text.replace(/\{\{\s*merchant\s*\}\}/g, shop).replace(/\{\{\s*first_name\s*\}\}/g, "Sam").replace(/\{\{\s*festival_date\s*\}\}/g, formatFestivalDate(startDate));
}

/**
 * One suggested message for a festival: preview in the chosen channel, then "Create draft".
 * Email, text and push save a campaign draft and open it in the message editor; WhatsApp opens the
 * broadcast composer with the template and its variables filled in.
 */
export function TemplateCard({ festival, year, startDate, template }: { festival: FestivalDef; year: number; startDate: string; template: FestivalTemplate }) {
  const { api, base, enabled, detail } = useMerchant();
  const router = useRouter();
  const act = useAction();
  const available: Record<Channel, boolean> = { email: enabled("marketing.email"), push: enabled("marketing.email"), sms: enabled("marketing.sms"), whatsapp: enabled("restaurant.whatsapp_marketing") };
  const first = (["email", "sms", "push", "whatsapp"] as const).find((c) => available[c]) ?? "email";
  const [channel, setChannel] = useState<Channel>(first);
  const [open, setOpen] = useState(false);
  const shop = detail.merchant.name;
  const text = channel === "email" ? template.body : channel === "whatsapp" ? template.whatsapp : template.sms;
  const shown = previewText(text, shop, startDate);

  async function create() {
    const r = await act.run(() => api.festivals.createDraft(festival.id, { templateId: template.id, channel, year }));
    if (!r) return;
    if (r.channel === "whatsapp") {
      const q = new URLSearchParams({ tab: "broadcast", template: template.whatsappTemplateName, festival: festival.id, tpl: template.id, year: String(year) });
      for (const p of festivalParams(template.whatsapp, startDate)) q.append("p", p);
      router.push(`${base}/restaurant/whatsapp?${q.toString()}`);
    } else if (r.messageId) router.push(`${base}/messages/${r.messageId}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card bg-card shadow-card p-4">
      <div className="min-w-0">
        <p className="text-body-strong text-fg">{template.label}</p>
        {channel === "email" ? <p className="mt-0.5 text-meta text-fg-muted">Subject: {previewText(template.subject, shop, startDate)}</p> : null}
      </div>
      <div>
        <p className={`whitespace-pre-line text-meta text-fg ${open ? "" : "line-clamp-4"}`}>{shown}</p>
        {shown.length > 160 ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 rounded-sm text-meta font-medium text-fg-muted underline decoration-line underline-offset-4 hover:text-fg focus-visible:focus-ring">
            {open ? "Show less" : "Read all"}
          </button>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <Select
          label="Send as"
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
          options={[
            { value: "email", label: available.email ? "Email" : "Email (Café & Retail)" },
            { value: "sms", label: available.sms ? "Text message" : "Text message (Café & Retail)" },
            { value: "push", label: available.push ? "App notification" : "App notification (Café & Retail)" },
            { value: "whatsapp", label: available.whatsapp ? "WhatsApp broadcast" : "WhatsApp broadcast (Restaurant Growth)" },
          ]}
          hint={channel === "whatsapp" ? "Opens the broadcast composer with this template filled in." : "Saved as a draft. You check it and send it."}
        />
        {act.error ? <p role="alert" className="text-meta text-negative">{act.error}</p> : null}
        <Button size="sm" variant="secondary" disabled={!available[channel]} loading={act.busy} onClick={() => void create()}>
          {channel === "whatsapp" ? "Open in broadcast" : "Create draft"}
        </Button>
      </div>
    </div>
  );
}
