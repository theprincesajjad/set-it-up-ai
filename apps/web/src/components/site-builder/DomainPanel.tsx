"use client";
/**
 * The web address: the Local Loyalty address (always on) and an optional .ca. With SITE_DOMAINS_ENABLED off (launch), a request
 * goes to our team's task list; on, the name is checked live and an owner-held name is routed automatically.
 */
import { useState } from "react";
import type { siteApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { useAction } from "@/lib/dashboard/useApi";
import type { SiteEndpoints } from "./siteApi";

const TONE = { requested: "info", pending: "warning", live: "success", failed: "danger" } as const;

export function DomainPanel({ api, b, siteUrl, onChange }: { api: SiteEndpoints; b: siteApi.SiteBuilderResponse; siteUrl: string; onChange: (b: siteApi.SiteBuilderResponse) => void }) {
  const c = copy.siteBuilder;
  const [name, setName] = useState("");
  const [check, setCheck] = useState<siteApi.DomainCheckResponse | null>(null);
  const [confirm, setConfirm] = useState(false);
  const act = useAction();
  const d = b.site.domain;
  const always = `${siteUrl.replace(/^https?:\/\//, "")}${b.site.path}`;

  async function runCheck() {
    const r = await act.run(() => api.checkDomain(name));
    if (r) setCheck(r);
  }
  async function request(mode: "register" | "connect") {
    if (!check) return;
    const r = await act.run(() => api.requestDomain({ hostname: check.hostname, mode }));
    if (r) {
      onChange(r);
      setCheck(null);
      setName("");
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <p className="text-body text-foreground">{c.domainAlways(always)}</p>
      {d ? (
        <div className="flex flex-col gap-2 rounded-r4 p-3 hairline-inset">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-body-strong text-foreground">{d.hostname}</span>
            {d.status !== "none" ? <Badge tone={TONE[d.status as keyof typeof TONE] ?? "neutral"}>{c.domainStatus[d.status as keyof typeof c.domainStatus]}</Badge> : null}
          </div>
          {d.note ? <p className="text-body text-muted-foreground">{d.note}</p> : null}
          {d.mode === "connect" && d.status !== "live" && d.dns.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-meta text-muted-foreground">{c.domainDns}</p>
              <ul className="flex flex-col gap-1 font-mono text-meta text-foreground">
                {d.dns.map((r) => (
                  <li key={`${r.type}-${r.name}`} dir="ltr" className="break-all">
                    {r.type} {r.name} → {r.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
              {c.domainRemove}
            </Button>
          </div>
        </div>
      ) : !b.entitlement.entitled ? (
        <p className="text-body text-muted-foreground">{c.domainNeedsPlan}</p>
      ) : (
        <>
          <p className="text-body text-muted-foreground">{b.domainsAuto ? c.domainHint : c.domainHintManual}</p>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runCheck();
            }}
          >
            <div className="min-w-0 flex-1">
              <TextField label={c.domainField} placeholder={c.domainPlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" />
            </div>
            <Button type="submit" variant="secondary" loading={act.busy && !check} disabled={name.trim().length < 3}>
              {c.domainCheck}
            </Button>
          </form>
          {check ? (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-body text-foreground">{check.available === true ? c.domainAvailable(check.hostname) : check.available === false ? c.domainTaken(check.hostname) : c.domainUnknown(check.hostname)}</p>
              <div className="flex flex-wrap gap-2">
                {check.included && check.available !== false ? (
                  <Button size="sm" onClick={() => void request("register")} disabled={act.busy}>
                    {c.domainRegister}
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => void request("connect")} disabled={act.busy}>
                  {c.domainConnect}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      {act.error ? (
        <p role="alert" className="text-body text-destructive-text">
          {act.error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={c.domainRemove}
        body={c.domainRemoveConfirm}
        confirmLabel={c.domainRemove}
        danger
        onConfirm={async () => {
          onChange(await api.removeDomain());
          setConfirm(false);
        }}
      />
    </div>
  );
}
