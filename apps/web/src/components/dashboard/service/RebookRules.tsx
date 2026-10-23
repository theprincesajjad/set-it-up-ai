"use client";
import { useState } from "react";
import { LOCALES, LOCALE_LIST, translator, type Locale, type serviceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { SwitchControl } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { DEFAULT_RULE_DAYS, ruleWeeks } from "@/lib/dashboard/rebooking";

/** Rebook-after per service: a number of weeks and an on switch. Starting numbers are estimates; change them to match your clients. */
export function RebookRules({ rules, onChange }: { rules: serviceApi.RebookRuleDto[]; onChange: (id: string, days: number | null) => void }) {
  return (
    <Panel title="Rebook after">
      {rules.length ? (
        <ul className="divide-y divide-line">
          {rules.map((r) => {
            const w = ruleWeeks(r.rebookAfterDays);
            return (
              <li key={r.serviceId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-body text-fg">{r.name}</span>
                {w ? (
                  <label className="flex items-center gap-1.5 text-meta text-fg-muted">
                    <input
                      aria-label={`Weeks before rebooking ${r.name}`}
                      inputMode="numeric"
                      className="h-8 w-12 rounded-input border border-line bg-bg text-center tabular text-fg focus-visible:focus-ring"
                      defaultValue={w}
                      onBlur={(e) => {
                        const n = Math.min(104, Math.max(1, Number.parseInt(e.target.value, 10) || w));
                        if (n !== w) onChange(r.serviceId, n * 7);
                        else e.target.value = String(w);
                      }}
                    />
                    weeks
                  </label>
                ) : (
                  <span className="text-meta text-fg-muted">No rule</span>
                )}
                <SwitchControl checked={!!w} ariaLabel={`Nudge ${r.name}`} onChange={(on) => onChange(r.serviceId, on ? DEFAULT_RULE_DAYS : null)} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-meta text-fg-muted">Add your services and prices first, then set how often each one comes back.</p>
      )}
      <p className="mt-3 text-caption text-fg-muted">Starting numbers are estimates. Change them to how your clients actually come back.</p>
    </Panel>
  );
}

/** The message a customer would get, in each language, with sample words. */
export function RebookPreview({ shop, name, service, weeks, slug }: { shop: string; name: string; service: string; weeks: number; slug: string }) {
  const [lang, setLang] = useState<Locale>("en");
  const t = translator(lang);
  const first = name.trim().split(/\s+/)[0] || "Ritu";
  const body = t("sv.msg.rebook", { name: first, service, shop, weeks, url: `${slug}.ll.ca/book` });
  return (
    <Panel title={`What ${first} receives`}>
      <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-1.5">
        {LOCALE_LIST.map((l) => (
          <button key={l.code} type="button" role="radio" aria-checked={l.code === lang} onClick={() => setLang(l.code)} className={cn("h-8 rounded-full border px-3 text-meta focus-visible:focus-ring", l.code === lang ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>
            {l.name}
          </button>
        ))}
      </div>
      <p dir={LOCALES[lang].dir} lang={LOCALES[lang].bcp47} className="mt-3 rounded-card bg-bg-subtle p-3 text-body text-fg">{body}</p>
      <p className="mt-3 text-caption text-fg-muted">Goes only to clients who agreed to messages from you. One message per service per cycle, never more than two without a visit in between, and a STOP reply ends them all. An existing-customer relationship alone may not be enough consent, so we do not send without it. Check CASL with your lawyer.</p>
    </Panel>
  );
}
