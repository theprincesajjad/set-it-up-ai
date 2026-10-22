"use client";
import { Code2, Link2, Plug, Receipt } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { integrationsApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, Section } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const CATEGORY_TITLE: Record<string, string> = { pos: "Point of sale: award points automatically", ecommerce: "Online store", marketing: "Marketing", automation: "Automation", messaging: "Messaging" };
const ERRORS: Record<string, string> = { invalid_state: "The connection link expired. Try again.", forbidden: "Only owners and managers can connect apps.", oauth_denied: "Permission wasn't granted.", oauth_exchange_failed: "We couldn't finish connecting. Try again.", already_linked: "That account is already linked to another shop." };

export default function IntegrationsPage() {
  const { api, base, enabled } = useMerchant();
  const toast = useToast();
  const params = useSearchParams();
  const list = useApi(() => api.integrations.list(), [api]);
  const unmatched = useApi(() => api.integrations.unmatched({ limit: 20 }), [api]);
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
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Integrations" description="POS auto-award, Mailchimp and webhooks are Plus features. Connect your POS and points are awarded automatically." actions={<Button variant="secondary" iconStart={Code2} href={`${base}/integrations/developers`}>Webhooks & API</Button>} />
      {status === "connected" ? <Banner tone="success">{provider ? `${provider[0]!.toUpperCase()}${provider.slice(1)} is connected.` : "Connected."} Match your locations and categories below.</Banner> : null}
      {status === "error" ? <Banner tone="danger">{ERRORS[params.get("error") ?? ""] ?? "We couldn't connect that app. Try again."}</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={list}>
        {(d) => {
          const visible = d.items.filter((i) => !hidden.has(i.provider) && i.provider !== "webhooks" && i.provider !== "api");
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
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(items ?? []).map((i) => (
                      <li key={i.provider}>
                        <Card padding="lg" className="flex h-full flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-input bg-bg-subtle text-label font-bold text-fg">
                              {i.name.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-title text-fg">{i.name}</h3>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {i.status === "not_connected" ? <Badge>Not connected</Badge> : <StatusBadge domain="integration" status={i.status} label={i.status === "pending" ? "Finishing setup..." : i.status === "error" ? "Needs attention" : undefined} />}
                                <Badge tone="success">Free</Badge>
                              </div>
                            </div>
                          </div>
                          <p className="text-meta text-fg-muted">{i.description}</p>
                          {i.status === "connected" && i.lastSyncAt ? <p className="text-caption text-fg-muted">Last sync {relativeTime(i.lastSyncAt)}</p> : null}
                          <div className="mt-auto flex gap-2">
                            {!i.available ? (
                              <Badge>Coming soon</Badge>
                            ) : i.status === "connected" || i.status === "pending" || i.status === "error" ? (
                              <Button variant="secondary" size="sm" href={`${base}/integrations/${i.provider}`}>
                                Manage
                              </Button>
                            ) : i.auth === "managed" ? (
                              <Badge tone="info">Managed for you</Badge>
                            ) : i.auth === "api_key" || i.auth === "webhook" ? (
                              <Button variant="secondary" size="sm" href={`${base}/integrations/developers`}>
                                Set up
                              </Button>
                            ) : (
                              <Button variant="secondary" size="sm" iconStart={Plug} loading={act.busy && connecting?.provider === i.provider} onClick={() => {
                                setConnecting(i);
                                setFields({});
                                if (!i.connectFields.some((f) => f.required)) void connect(i);
                              }}>
                                Connect
                              </Button>
                            )}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
            </>
          );
        }}
      </Async>

      <Section title="Purchases without a customer">
        <p className="text-meta text-fg-muted">POS sales where we couldn&apos;t tell who the customer was. Attach a phone number to give them their points (within 30 days).</p>
        {unmatched.data?.items.length ? (
          <Card padding="sm">
            <ul className="divide-y divide-line">
              {unmatched.data.items.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-2 py-3">
                  <Receipt aria-hidden className="size-5 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-strong text-fg">
                      {formatMoney(u.totalCents)} · {u.provider}
                      {u.receiptCode ? ` · Receipt ${u.receiptCode}` : ""}
                    </p>
                    <p className="text-meta text-fg-muted">
                      {formatDateTime(u.occurredAt)}
                      {u.customerName ? ` · ${u.customerName}` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" iconStart={Link2} onClick={() => setAttach(u)}>
                    Attach phone
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card tone="flat">
            <p className="text-meta text-fg-muted">{unmatched.loading ? "Loading..." : "Nothing waiting. Every POS sale found its customer."}</p>
          </Card>
        )}
      </Section>

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
