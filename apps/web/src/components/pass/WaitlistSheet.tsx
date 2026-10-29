"use client";
/**
 * "Full. Tell me if a spot opens" (phase-pro P2, docs/business/pro-value.md §3.2 P2): the sheet the booking page opens from a full day.
 * The client picks the part of the day and how far ahead they can come; signed out, they add a name and a phone number or email. Then:
 * "You're on the list. We'll message you if a spot opens."
 */
import { CircleCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { waitlistApi } from "@ll/shared";
import { useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { publicWaitlistEndpoints } from "@/lib/api/waitlist";
import { cn } from "@/lib/cn";
import { dayDate } from "@/lib/restaurant/util";

const api = publicWaitlistEndpoints(browserClient);
type Span = "day" | "week" | "two";
const PREFS: waitlistApi.WaitlistTimePref[] = ["any", "morning", "afternoon", "evening"];

function addDays(d: string, n: number): string {
  const x = dayDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** The pill choice the booking page uses (44 tall, the shop's colour when picked). */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={cn("h-11 shrink-0 rounded-full border px-4 text-body focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
      {children}
    </button>
  );
}

export function WaitlistSheet({ open, onClose, shop, serviceId, serviceName, staffId, day, full, signedIn, needsName }: { open: boolean; onClose: () => void; shop: { slug: string; name: string }; serviceId: string; serviceName: string; staffId: string | null; day: string; full: boolean; signedIn: boolean; needsName: boolean }) {
  const { t, date } = useFmt();
  const [span, setSpan] = useState<Span>(full ? "day" : "two");
  const [pref, setPref] = useState<waitlistApi.WaitlistTimePref>("any");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const weekday = date(dayDate(day), { weekday: "long" }, "UTC");
  const askName = !signedIn || needsName;
  const email = contact.includes("@");

  async function join() {
    setTried(true);
    if (askName && !name.trim()) return;
    if (!signedIn && !contact.trim()) return;
    setBusy(true);
    setError(null);
    const end = span === "day" ? day : span === "week" ? addDays(day, 6) : addDays(day, 13);
    try {
      await api.join(shop.slug, { serviceId, staffId, windowStart: day, windowEnd: end, timePref: pref, name: name.trim() || null, phone: !signedIn && !email ? contact.trim() : null, email: !signedIn && email ? contact.trim() : null });
      setDone(true);
    } catch (e) {
      setError(isApiError(e) && e.isNetwork ? t("rc.error.body") : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} variant="sheet" title={done ? t("wl.sheet.doneTitle") : t("wl.sheet.title")}>
      {done ? (
        <div className="flex flex-col gap-4" data-testid="wl-joined">
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <p className="text-body text-fg">{t("wl.sheet.done")}</p>
          <p className="text-meta text-fg-muted">{t("wl.sheet.doneHold", { shop: shop.name })}</p>
          <Button size="lg" fullWidth onClick={onClose}>{t("wl.sheet.close")}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-body text-fg-muted">{t("wl.sheet.body", { shop: shop.name, service: serviceName })}</p>
          <div className="flex flex-col gap-2">
            <p className="text-meta-strong text-fg" id="wl-span">{t("wl.sheet.when")}</p>
            <div role="radiogroup" aria-labelledby="wl-span" className="flex flex-wrap gap-2">
              <Pill on={span === "day"} onClick={() => setSpan("day")}>{t("wl.sheet.just", { day: weekday })}</Pill>
              <Pill on={span === "week"} onClick={() => setSpan("week")}>{t("wl.sheet.week")}</Pill>
              <Pill on={span === "two"} onClick={() => setSpan("two")}>{t("wl.sheet.twoWeeks")}</Pill>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-meta-strong text-fg" id="wl-pref">{t("wl.sheet.time")}</p>
            <div role="radiogroup" aria-labelledby="wl-pref" className="flex flex-wrap gap-2">
              {PREFS.map((p) => (
                <Pill key={p} on={pref === p} onClick={() => setPref(p)}>{t(`wl.pref.${p}`)}</Pill>
              ))}
            </div>
          </div>
          {askName ? <TextField label={t("bk.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" error={tried && !name.trim() ? t("bk.nameRequired") : undefined} /> : null}
          {!signedIn ? (
            <TextField label={t("wl.sheet.contact")} hint={t("wl.sheet.contactHint")} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="tel" inputMode={email ? "email" : "tel"} error={tried && !contact.trim() ? t("wl.sheet.contactRequired") : undefined} />
          ) : null}
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button size="lg" fullWidth loading={busy} onClick={() => void join()}>{t("wl.sheet.submit")}</Button>
        </div>
      )}
    </Modal>
  );
}
