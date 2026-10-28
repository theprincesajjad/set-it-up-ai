"use client";
import Link from "next/link";
import { Suspense } from "react";
import { messagingApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { PageHeader, QuietLink, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { rewardNoun } from "@/lib/dashboard/home";
import { useApi } from "@/lib/dashboard/useApi";
import { AudienceHeader } from "./Audience";
import { Composer } from "./Composer";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function MessagesPageGated() {
  return (
    <FeatureGate keys={["marketing.email", "marketing.sms"]} title="Email & SMS campaigns">
      <Suspense>
        <MessagesPage />
      </Suspense>
    </FeatureGate>
  );
}

const CHANNEL: Record<string, string> = { sms: "Text", email: "Email", push: "Wallet pass" };

function MessagesPage() {
  const { api, base, enabled, detail } = useMerchant();
  const list = useApi(() => api.messages.list({ limit: 30 }), [api]);
  const autos = useApi(enabled("marketing.automations") ? () => api.messages.automations() : null, [api]);
  const sms = enabled("marketing.sms");
  const sent = (list.data?.items ?? []).filter((m) => m.status === "sent" || m.status === "scheduled" || m.status === "sending");
  const autoRows = (autos.data?.items ?? []).filter((a) => a.last30Days.messaged > 0 && a.channel !== "push");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Messages"
        description={`${sms ? "Texts and emails" : "Emails"} go only to people who agreed. Your business name, address and a ${sms ? "STOP line" : "way to unsubscribe"} are added for you.`}
        actions={
          <>
            <Button size="md" variant="secondary" href="#automations" className="h-[38px] rounded-full px-4 text-[14px] font-medium">Automations</Button>
            <Button size="md" variant="secondary" href="#sent" className="h-[38px] rounded-full px-4 text-[14px] font-medium">Sent</Button>
          </>
        }
      />
      <AudienceHeader />
      <Composer onSent={() => void list.reload()} />

      <section id="automations" aria-labelledby="auto-h" className="scroll-mt-20">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
          <h2 id="auto-h" className="text-[18px] font-semibold text-fg">Automations</h2>
          <span className="text-[13px] text-fg-muted">Run on their own, once per person</span>
        </div>
        {!enabled("marketing.automations") ? (
          <p className="border-b border-line py-3 text-[14px] text-fg-muted">Automations come with Café & Retail. A free drink waiting, a win-back text and a birthday treat send themselves.</p>
        ) : autos.loading && !autos.data ? (
          <SkeletonRows rows={3} />
        ) : (
          <ul>
            {(["reward_ready", "win_back", "birthday"] as const).map((k) => {
              const a = autos.data?.items.find((x) => x.kind === k);
              return a ? <AutomationRow key={k} a={a} sms={sms} vertical={detail.merchant.vertical} onChange={() => void autos.reload()} /> : null;
            })}
          </ul>
        )}
      </section>

      <section id="sent" aria-labelledby="sent-h" className="scroll-mt-20">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
          <h2 id="sent-h" className="text-[18px] font-semibold text-fg">Sent</h2>
          <span className="text-[13px] text-fg-muted">Result = came in within 7 days</span>
        </div>
        {list.loading && !list.data ? (
          <SkeletonRows rows={3} />
        ) : sent.length === 0 && autoRows.length === 0 ? (
          <p className="border-b border-line py-3 text-[14px] text-fg-muted">Nothing sent yet. Your first message shows how many people came in after it.</p>
        ) : (
          <ul>
            {sent.map((m) => (
              <SentRow key={m.id} m={m} href={`${base}/messages/${m.id}`} />
            ))}
            {autoRows.map((a) => (
              <li key={a.kind} className="flex items-center justify-between gap-3 border-b border-line py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-fg">{a.label} (automation)</p>
                  <p className="text-[12px] text-fg-muted">{CHANNEL[a.channel]} · last 30 days · {formatNumber(a.last30Days.messaged)} people</p>
                </div>
                <span className="shrink-0 text-[14px] font-medium text-positive-text">{formatNumber(a.last30Days.cameIn7d)} came in</span>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-3">
          <QuietLink href={`${base}/messages/automations`}>Edit automation wording</QuietLink>
        </div>
      </section>
    </div>
  );
}

function SentRow({ m, href }: { m: messagingApi.Message; href: string }) {
  const when = m.sentAt ?? m.scheduledAt ?? m.createdAt;
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 border-b border-line py-3.5 hover:bg-bg-subtle focus-visible:focus-ring">
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-fg">{m.subject ?? m.body.slice(0, 60)}</span>
          <span className="block text-[12px] text-fg-muted">
            {CHANNEL[m.channel]} · {m.status === "scheduled" ? `Scheduled ${formatDateTime(when)}` : formatDateTime(when)} · {formatNumber(m.recipientCount)} people
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-medium">
          {m.cameIn7d != null ? (
            <span className="text-positive-text" title={m.cameIn7dFinal ? undefined : "Still counting: it has been fewer than 7 days"}>
              {formatNumber(m.cameIn7d)} came in{m.cameIn7dFinal ? "" : " so far"}
            </span>
          ) : (
            <span className="text-fg-muted">{m.status === "scheduled" ? "Scheduled" : m.status}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

const AUTO_COPY: Record<string, { title: (noun: string) => string; hint: (days: number | null) => string }> = {
  reward_ready: { title: (n) => `${n[0]!.toUpperCase()}${n.slice(1)} ready`, hint: () => "Updates the wallet pass and shows on the lock screen. No text, no consent needed." },
  win_back: { title: () => "We miss you", hint: (d) => `Text ${d ?? 21} days after a regular's last visit, only if they agreed` },
  birthday: { title: () => "Birthday treat", hint: () => "One text in their birthday week with a free item" },
};

function AutomationRow({ a, sms, vertical, onChange }: { a: messagingApi.Automation; sms: boolean; vertical: string; onChange: () => void }) {
  const { api, base, enabled } = useMerchant();
  const toast = useToast();
  const copy = AUTO_COPY[a.kind]!;
  const locked = !enabled("marketing.automations");
  const toggle = async (on: boolean) => {
    // First time on: Free drink ready is a wallet pass update; the others are texts when SMS is on, else email.
    const channel: messagingApi.Channel = a.kind === "reward_ready" ? "push" : a.configured ? a.channel : sms ? "sms" : "email";
    try {
      await api.messages.saveAutomation(a.kind, { enabled: on, channel, subject: a.subject, body: a.body, days: a.kind === "win_back" ? (a.days ?? messagingApi.LAPSED_DEFAULT_DAYS) : undefined });
      onChange();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  };
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-3.5">
      <div className="min-w-0">
        <p className="text-[15px] text-fg">{copy.title(rewardNoun(vertical))}</p>
        <p className="text-[12px] text-fg-muted">{copy.hint(a.days)}</p>
        {locked ? (
          <p className="text-[12px] text-fg-muted">
            Automations are not on your plan.{" "}
            <Link href={`${base}/billing`} className="font-medium text-fg underline underline-offset-4 focus-visible:focus-ring">See plans in Billing</Link>
          </p>
        ) : null}
      </div>
      <SwitchControl ariaLabel={`${copy.title(rewardNoun(vertical))} automation`} checked={a.enabled} disabled={locked} onChange={(v) => void toggle(v)} />
    </li>
  );
}
