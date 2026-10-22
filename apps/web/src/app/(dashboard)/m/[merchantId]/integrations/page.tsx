"use client";
import { Code2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { integrationsApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { PageHeader, Section, StatusDot, ToolbarButton } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const CATEGORY_TITLE: Record<string, string> = { pos: "Point of sale", ecommerce: "Online store", marketing: "Marketing & listings", automation: "Automation", messaging: "Messaging" };
const ERRORS: Record<string, string> = { invalid_state: "The connection link expired. Try again.", forbidden: "Only owners and managers can connect apps.", oauth_denied: "Permission wasn't granted.", oauth_exchange_failed: "We couldn't finish connecting. Try again.", already_linked: "That account is already linked to another shop." };

export default function IntegrationsPage() {
  const { api, base, enabled } = useMerchant();
  const toast = useToast();
  const params = useSearchParams();
  const list = useApi(() => api.integrations.list(), [api]);
  const unmatched = useApi(enabled("integrations.pos_auto_award") ? () => api.integrations.unmatched({ limit: 20 }) : null, [api]);
  const [connecting, setConnecting] = useState<integrationsApi.IntegrationSummary | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState<integrationsApi.UnmatchedPurchase | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const act = useAction();
  const status = params.get("status");
  const provider = params.get("provider");

  async function connect(i: integrationsApi.IntegrationSummary, body: Record<string, string> = {}) {
    const r = await act.run(() => api.integrations.connect(i.provider, body));
    if (!r) return;
    if (r.authUrl) window.location.assign(r.authUrl);
    else {
      toast({ message: `${i.name} connected`, tone: "success" });
      setConnecting(null);
      await list.reload();
    }
  }

  const hidden = new Set(enabled("payments.in_app") || enabled("marketing.sms") ? [] : ["twilio"]);
  const posOn = enabled("integrations.pos_auto_award");
  const hooksOn = enabled("integrations.webhooks");
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        flush
        title="Integrations"
        description={posOn ? "Connect your POS and points are awarded automatically." : "Connect the tools your shop already uses."}
        actions={hooksOn ? <ToolbarButton icon={Code2} href={`${base}/integrations/developers`}>Webhooks & API</ToolbarButton> : undefined}
      />
      {status === "connected" ? <Banner tone="success">{provider ? `${provider[0]!.toUpperCase()}${provider.slice(1)} is connected.` : "Connected."} Match your locations and categories below.</Banner> : null}
      {status === "error" ? <Banner tone="danger">{ERRORS[params.get("error") ?? ""] ?? "We couldn't connect that app. Try again."}</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={list}>
        {(d) => {
          // Pricing v2: paid connectors (POS, Mailchimp, automation) are listed only when their feature is on,
          // or when a connection already exists (shown as paused).
          const visible = d.items.filter((i) => !hidden.has(i.provider) && i.provider !== "webhooks" && i.provider !== "api" && (!i.locked || i.status !== "not_connected"));
          const lockedCount = d.items.filter((i) => i.locked && i.status === "not_connected").length;
          const groups: [string, integrationsApi.IntegrationSummary[]][] = [...new Set(visible.map((i) => i.category))].map((c) => [c, visible.filter((i) => i.category === c)]);
          return (
            <>
              {d.items.filter((i) => i.status === "error").map((i) => (
                <Banner key={i.provider} tone="danger" action={<Button size="sm" variant="ghost" onClick={() => connect(i)}>Reconnect</Button>}>
                  {i.name} disconnected. Reconnect to keep awarding points automatically.
                </Banner>
              ))}
              {groups.map(([cat, items]) => (
                <Section key={cat} title={CATEGORY_TITLE[cat] ?? cat}>
                  <ul className="divide-y divide-line border-y border-line">
                    {(items ?? []).map((i) => (
                      <li key={i.provider} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-meta-strong text-fg">
                          {i.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-strong text-fg">
                            {i.name}
                            {i.status !== "not_connected" ? <StatusDot domain="integration" status={i.status} label={i.locked ? "Paused" : i.status === "pending" ? "Finishing setup..." : i.status === "error" ? "Needs attention" : undefined} /> : null}
                          </h3>
                          <p className="text-meta text-fg-muted">{i.pausedReason ?? i.description}</p>
                          {i.status === "connected" && i.lastSyncAt ? <p className="text-caption font-normal text-fg-muted">Last sync {relativeTime(i.lastSyncAt)}</p> : null}
                        </div>
                        <div className="shrink-0">
                          {!i.available ? (
                            <span className="text-meta text-fg-muted">Coming soon</span>
                          ) : i.status === "connected" || i.status === "pending" || i.status === "error" ? (
                            <Button variant="secondary" size="sm" href={`${base}/integrations/${i.provider}`}>
                              Manage
                            </Button>
                          ) : i.auth === "managed" ? (
                            <span className="text-meta text-fg-muted">Managed for you</span>
                          ) : i.auth === "api_key" || i.auth === "webhook" ? (
                            <Button variant="secondary" size="sm" href={`${base}/integrations/developers`}>
                              Set up
                            </Button>
                          ) : (
                            <Button variant="secondary" size="sm" loading={act.busy && connecting?.provider === i.provider} onClick={() => {
                              setConnecting(i);
                              setFields({});
                              if (!i.connectFields.some((f) => f.required)) void connect(i);
                            }}>
                              Connect
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
              {lockedCount ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
                  <span className="text-fg">POS auto-award, Mailchimp, Zapier and webhooks</span>
                  <span aria-hidden>·</span>
                  <span>coming with Plus</span>
                  <span aria-hidden>·</span>
                  <NotifyLink keys={["integrations.pos_auto_award", "integrations.webhooks"]} />
                </p>
              ) : null}
            </>
          );
        }}
      </Async>

      {posOn ? (
        <Section title="Purchases without a customer" description="POS sales where we couldn't tell who the customer was. Attach a phone number to give them their points (within 30 days).">
          {unmatched.data?.items.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {unmatched.data.items.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-meta-strong text-fg">
                      {formatMoney(u.totalCents)} · {u.provider}
                      {u.receiptCode ? ` · Receipt ${u.receiptCode}` : ""}
                    </p>
                    <p className="text-meta text-fg-muted">
                      {formatDateTime(u.occurredAt)}
                      {u.customerName ? ` · ${u.customerName}` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setAttach(u)}>
                    Attach phone
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-y border-line py-4 text-meta text-fg-muted">{unmatched.loading ? "Loading..." : "Nothing waiting. Every POS sale found its customer."}</p>
          )}
        </Section>
      ) : null}

      <Modal
        open={!!connecting && connecting.connectFields.some((f) => f.required)}
        onClose={() => setConnecting(null)}
        title={`Connect ${connecting?.name ?? ""}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConnecting(null)}>
              Cancel
            </Button>
            <Button loading={act.busy} onClick={() => connecting && connect(connecting, fields)}>
              Connect
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {connecting?.connectFields.map((f) => (
            <TextField key={f.key} label={f.label} optionalLabel={!f.required} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
          ))}
        </div>
      </Modal>
      <Modal
        open={!!attach}
        onClose={() => setAttach(null)}
        title="Attach a customer"
        description={attach ? `${formatMoney(attach.totalCents)} on ${formatDateTime(attach.occurredAt)}. They'll get the points and join if they're new.` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAttach(null)}>
              Cancel
            </Button>
            <Button
              loading={act.busy}
              onClick={async () => {
                if (!phone) return act.setError("Enter a 10-digit mobile number.");
                const r = await act.run(() => api.integrations.attach(attach!.id, { phone }));
                if (r) {
                  toast({ message: `${r.pointsAwarded} points awarded. Balance ${r.balance}.`, tone: "success" });
                  setAttach(null);
                  await unmatched.reload();
                }
              }}
            >
              Award points
            </Button>
          </>
        }
      >
        <PhoneField label="Customer's mobile number" onChangeE164={setPhone} />
      </Modal>
    </div>
  );
}
