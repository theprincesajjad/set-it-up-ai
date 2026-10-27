"use client";
import { useEffect, useState } from "react";
import { waitText } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function DoorPage() {
  return (
    <FeatureGate keys={["booking.walkin_queue"]} title="Door tablet">
      <Door />
    </FeatureGate>
  );
}

const chip = (on: boolean) => cn("rounded-pill border px-4 py-2 text-meta-strong", on ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle");

/** The tablet at the door (Figma frame 2): a wait panel and the same join form a customer sees on their phone. It does not leave the page. */
function Door() {
  const { api, base } = useMerchant();
  const act = useAction();
  const board = useApi(() => api.barber.board(), [api], { pollMs: 10_000 });
  const b = board.data;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [joined, setJoined] = useState<{ name: string; position: number | null } | null>(null);
  useEffect(() => {
    if (!joined) return;
    const t = setTimeout(() => setJoined(null), 8000);
    return () => clearTimeout(t);
  }, [joined]);
  const open = b?.settings.open ?? false;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    const r = await act.run(() => api.barber.add({ name: name.trim(), phone: phone ?? undefined, serviceId: serviceId || null, requestedStaffId: staffId || null, textConsent: consent && !!phone, source: "tablet" }));
    if (r) {
      setJoined({ name: r.entry.name, position: r.entry.position });
      setName("");
      setPhone(null);
      setFieldKey((k) => k + 1);
      setServiceId("");
      setStaffId("");
      setConsent(false);
      setTried(false);
      await board.reload();
    }
  }
  return (
    <div className="grid min-h-[calc(100vh-8rem)] grid-cols-1 overflow-hidden rounded-card border border-line md:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex flex-col justify-center gap-3 bg-fg px-8 py-10 text-bg">
        <p className="text-meta text-bg/70">{open ? "The line" : "The line is closed"}</p>
        <p className="font-display text-[40px] font-semibold leading-none tracking-[-0.02em]">{open ? (b?.stats.estimateMin === null ? "No chair" : (waitText(b?.stats.estimateMin ?? 0) || "...").replace(/^about /, "About ").replace("no wait", "No wait")) : "Closed"}</p>
        <p className="text-body text-bg/80">{b ? `${b.stats.waiting} waiting, ${b.stats.chairsTaking} barber${b.stats.chairsTaking === 1 ? "" : "s"} taking walk-ins.` : ""}</p>
        <p className="text-meta text-bg/60">We text you when you are next. Stay close: you have {b?.settings.callHoldMinutes ?? 5} minutes after we call.</p>
        <Button variant="secondary" size="sm" className="mt-4 self-start" href={`${base}/queue`}>Back to the line</Button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5 px-8 py-8">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em] text-fg">Walk in? Join the line</h1>
        {joined ? <Banner tone="success">{joined.name}, you are in line{joined.position ? ` at number ${joined.position}` : ""}.</Banner> : null}
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {!open ? <Banner tone="info">The line is closed. Ask at the desk.</Banner> : null}
        <TextField label="First name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? "Add a first name" : undefined} autoComplete="off" />
        <PhoneField key={fieldKey} label="Mobile number (for the text)" onChangeE164={setPhone} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-fg-muted">What are you here for?</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(serviceId === "")} onClick={() => setServiceId("")}>Cut</button>
            {(b?.services ?? []).filter((s) => s.name !== "Cut").map((s) => (
              <button key={s.id} type="button" className={chip(serviceId === s.id)} onClick={() => setServiceId(s.id)}>{s.name}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-fg-muted">Your barber (optional)</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(staffId === "")} onClick={() => setStaffId("")}>Anyone</button>
            {(b?.chairs ?? []).filter((c) => c.takesWalkIns).map((c) => (
              <button key={c.staffId} type="button" className={chip(staffId === c.staffId)} onClick={() => setStaffId(c.staffId)}>{c.name.split(" ")[0]}</button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-body text-fg">
          <input type="checkbox" className="size-5" checked={consent} disabled={!phone} onChange={(e) => setConsent(e.target.checked)} />
          Text me when I&apos;m next. One text, no ads. Reply STOP any time.
        </label>
        <Button type="submit" size="lg" loading={act.busy} disabled={!open}>Join the line</Button>
      </form>
    </div>
  );
}
