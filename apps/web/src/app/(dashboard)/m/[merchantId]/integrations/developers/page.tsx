"use client";
import { ArrowLeft, Copy, KeyRound, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { integrationsApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

function Secret({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <Banner tone="warning">Copy this now. For your security we only show it once.</Banner>
      <div className="flex items-center gap-2 rounded-input bg-bg-subtle p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-meta text-fg" aria-label={label}>
          {value}
        </code>
        <IconButton icon={Copy} label={`Copy ${label}`} onClick={async () => {
          await navigator.clipboard?.writeText(value).catch(() => undefined);
          toast("Copied");
        }} />
      </div>
    </div>
  );
}

export default function DevelopersPage() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const hooks = useApi(() => api.integrations.webhooks(), [api]);
  const key = useApi(role === "owner" ? () => api.apiKey() : null, [api, role]);
  const [create, setCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["points.earned"]);
  const [desc, setDesc] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [rotate, setRotate] = useState(false);
  const [del, setDel] = useState<integrationsApi.OutboundWebhook | null>(null);
  const [log, setLog] = useState<{ hook: integrationsApi.OutboundWebhook; items: integrationsApi.WebhookDelivery[] } | null>(null);
  const act = useAction();

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/integrations`} className="self-start">
        Integrations
      </Button>
      <PageHeader title="Webhooks & API" description="Send events to your own systems, Zapier or Make. Free." />

      {role === "owner" ? (
        <Card padding="lg">
          <CardHeader title="API key" subtitle="For a custom POS or script: award, redeem and look up members." action={key.data?.configured ? <Badge tone="success">Active</Badge> : <Badge>Not set</Badge>} />
          {apiKey ? <Secret label="API key" value={apiKey} /> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" iconStart={KeyRound} onClick={() => (key.data?.configured ? setRotate(true) : void act.run(async () => {
              const r = await api.createApiKey();
              setApiKey(r.apiKey);
              await key.reload();
            }))}>
              {key.data?.configured ? "Rotate key" : "Generate key"}
            </Button>
            {key.data?.configured ? (
              <Button variant="ghost" onClick={async () => {
                await act.run(() => api.deleteApiKey());
                setApiKey(null);
                await key.reload();
                toast("Key revoked");
              }}>
                Revoke
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-caption text-fg-muted">Send it as the X-LL-Api-Key header. Docs: POST /v1/api/award, /v1/api/redeem, GET /v1/api/members/:phone.</p>
        </Card>
      ) : null}

      <Card padding="lg">
        <CardHeader title="Outgoing webhooks" subtitle="We sign every delivery with X-LL-Signature and retry for 24 hours." action={<Button variant="secondary" size="sm" iconStart={Plus} onClick={() => { setCreate(true); setSecret(null); }}>Add endpoint</Button>} />
        <Async state={hooks}>
          {(d) =>
            d.items.length ? (
              <ul className="divide-y divide-line">
                {d.items.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-meta text-fg">{h.url}</p>
                      <p className="text-caption text-fg-muted">
                        {h.events.join(", ")}
                        {h.description ? ` · ${h.description}` : ""}
                      </p>
                    </div>
                    <div className="w-32">
                      <Switch label="Active" checked={h.active} onChange={async (v) => {
                        await act.run(() => api.integrations.updateWebhook(h.id, { active: v }));
                        await hooks.reload();
                      }} />
                    </div>
                    <Button size="sm" variant="secondary" iconStart={Send} onClick={async () => {
                      const r = await act.run(() => api.integrations.testWebhook(h.id));
                      if (r) toast({ message: `Test ${r.status}${r.statusCode ? ` (${r.statusCode})` : ""}`, tone: r.status === "delivered" ? "success" : "error" });
                    }}>
                      Send test
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const r = await act.run(() => api.integrations.deliveries(h.id));
                      if (r) setLog({ hook: h, items: r.items });
                    }}>
                      Deliveries
                    </Button>
                    <IconButton icon={Trash2} label={`Delete ${h.url}`} onClick={() => setDel(h)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-meta text-fg-muted">No endpoints yet.</p>
            )
          }
        </Async>
      </Card>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      <Modal open={create} onClose={() => setCreate(false)} title="Add a webhook endpoint" size="md" actions={secret ? <Button onClick={() => setCreate(false)}>Done</Button> : (
        <>
          <Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button>
          <Button loading={act.busy} onClick={async () => {
            if (!url.trim() || !events.length) return act.setError("Add a URL and at least one event.");
            const r = await act.run(() => api.integrations.createWebhook({ url: url.trim(), events, description: desc.trim() || null }));
            if (r) {
              setSecret(r.secret);
              setUrl("");
              await hooks.reload();
            }
          }}>Add endpoint</Button>
        </>
      )}>
        {secret ? (
          <Secret label="Signing secret" value={secret} />
        ) : (
          <div className="flex flex-col gap-4">
            <TextField type="url" label="Endpoint URL" placeholder="https://example.com/hooks/loyalty" value={url} onChange={(e) => setUrl(e.target.value)} />
            <TextField label="Description" optionalLabel value={desc} onChange={(e) => setDesc(e.target.value)} />
            <fieldset className="grid gap-1 sm:grid-cols-2">
              <legend className="mb-2 text-label text-fg">Events</legend>
              {(hooks.data?.events ?? []).map((ev) => (
                <Checkbox key={ev} label={<span className="font-mono text-meta">{ev}</span>} checked={events.includes(ev)} onChange={(c) => setEvents(c ? [...events, ev] : events.filter((x) => x !== ev))} />
              ))}
            </fieldset>
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          </div>
        )}
      </Modal>
      <Modal open={!!log} onClose={() => setLog(null)} title="Recent deliveries" size="md">
        {log?.items.length ? (
          <ul className="divide-y divide-line text-meta">
            {log.items.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                <span className="font-mono">{x.event}</span>
                <span className="text-fg-muted">{formatDateTime(x.createdAt)}</span>
                <Badge tone={x.status === "delivered" ? "success" : x.status === "failed" ? "danger" : "info"}>{x.status}{x.lastStatusCode ? ` ${x.lastStatusCode}` : ""}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-fg-muted">No deliveries yet.</p>
        )}
      </Modal>
      <ConfirmDialog open={rotate} onClose={() => setRotate(false)} title="Rotate the API key?" body="The old key stops working right away. Update your POS or scripts with the new one." confirmLabel="Rotate key" danger onConfirm={async () => {
        const r = await api.createApiKey();
        setApiKey(r.apiKey);
        await key.reload();
      }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete this endpoint?" body={del?.url} confirmLabel="Delete" danger onConfirm={async () => {
        await api.integrations.deleteWebhook(del!.id);
        await hooks.reload();
      }} />
    </div>
  );
}
