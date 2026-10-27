"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { barberApi } from "@ll/shared";
import { Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

const chip = (on: boolean) => cn("rounded-pill border px-4 py-2 text-meta-strong", on ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle");

/**
 * /shops/<slug>/queue: join the shop's walk-in line from a phone (Figma M1). A guest gives a first name and a mobile number for the one
 * text; a signed-in customer also gets "my barber" and the family on their card.
 */
export function QueueJoin({ shop, data, signedIn, meName }: { shop: { name: string; slug: string; logoUrl: string | null; brandColor: string | null }; data: barberApi.PublicQueueResponse; signedIn: boolean; meName?: string | null }) {
  const { t } = useFmt();
  const router = useRouter();
  const [name, setName] = useState(meName?.split(" ")[0] ?? "");
  const [phone, setPhone] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [consent, setConsent] = useState(false);
  const [family, setFamily] = useState<barberApi.FamilyMemberDto[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [mine, setMine] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    void browserApi.me.family().then((r) => setFamily(r.items)).catch(() => undefined);
    void browserApi.me.myBarber(shop.slug).then((r) => {
      setMine(r.staffId);
      if (r.staffId && data.barbers.some((b) => b.id === r.staffId)) setStaffId(r.staffId);
    }).catch(() => undefined);
  }, [signedIn, shop.slug, data.barbers]);

  const estimate = data.estimateMin === null ? null : data.estimateMin <= 0 ? t("q.noWait") : t("q.estimate", { min: data.estimateMin });
  const closed = !data.open;
  const needsPhone = !signedIn;
  const nameErr = tried && !name.trim() ? t("q.nameRequired") : undefined;
  const phoneErr = tried && needsPhone && consent && !phone ? t("q.consentNeedsPhone") : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || (consent && needsPhone && !phone)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await browserApi.public.joinQueue(shop.slug, { name: name.trim(), phone: phone ?? undefined, serviceId: serviceId || null, requestedStaffId: staffId || null, textConsent: consent, familyMemberIds: picked, source: "join" });
      if (signedIn && (staffId || null) !== mine) await browserApi.me.setMyBarber(shop.slug, staffId || null).catch(() => undefined);
      router.push(`/line/${r.token}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <ShopHead shop={shop} kicker={t("q.title")} href={`/shops/${shop.slug}`} />
      <Heading plain>{t("q.title")}</Heading>
      <div className="flex flex-col gap-1 rounded-card bg-accent-soft px-4 py-3.5">
        <p className="text-title font-semibold text-accent-text">{closed ? t("q.closed") : (estimate ?? "")}</p>
        {!closed ? <p className="text-meta text-fg-muted">{t("q.waitingNow", { n: data.waiting })}</p> : null}
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label={t("q.firstName")} value={name} onChange={(e) => setName(e.target.value)} error={nameErr} autoComplete="given-name" />
      <PhoneField label={t("q.phone")} onChangeE164={setPhone} error={phoneErr} />
      {data.services.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-fg-muted">{t("q.service")}</legend>
          <div className="flex flex-wrap gap-2">
            {data.services.map((s) => (
              <button key={s.id} type="button" className={chip(serviceId === s.id)} onClick={() => setServiceId(s.id)}>{s.name}</button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {data.barbers.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-fg-muted">{t("q.barber")}</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(staffId === "")} onClick={() => setStaffId("")}>{t("q.anyone")}</button>
            {data.barbers.map((b) => (
              <button key={b.id} type="button" className={chip(staffId === b.id)} onClick={() => setStaffId(b.id)} title={b.estimateMin === null ? undefined : t("q.barberWait", { name: b.name, min: b.estimateMin })}>
                {b.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {signedIn && family.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-fg-muted">{t("q.family")}</legend>
          <div className="flex flex-wrap gap-2">
            {family.map((f) => (
              <button key={f.id} type="button" className={chip(picked.includes(f.id))} aria-pressed={picked.includes(f.id)} onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}>
                + {f.firstName}
              </button>
            ))}
          </div>
          <p className="text-meta text-fg-muted">{t("q.familyNote")}</p>
        </fieldset>
      ) : null}
      {signedIn ? (
        <a className="text-meta text-fg underline" href="/me/family">{t("q.manageFamily")}</a>
      ) : null}
      <label className="flex items-start gap-3 text-body text-fg">
        <input type="checkbox" className="mt-1 size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t("q.consent")}</span>
      </label>
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={closed}>
        {t("q.join")}
      </Button>
    </form>
  );
}
