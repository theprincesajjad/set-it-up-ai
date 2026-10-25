"use client";
import { Meter, PageHeader, Panel, EmptyState } from "@/components/dashboard/kit";
import { MapPin, Navigation, Phone, Presentation, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { repApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Sheet } from "@/components/dashboard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { applyOutcome, cacheDay, cachedDay, enqueue, flushQueue, loadQueue, newClientId, saveQueue, type QueuedOutcome } from "@/lib/rep/outcomeQueue";
import { pitchSteps, proofHighlights } from "@/lib/rep/pitch";

const LANG: Record<string, string> = { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" };
const mapsHref = (s: repApi.StreetStop) => (s.lat != null && s.lng != null ? `https://maps.google.com/?q=${s.lat},${s.lng}` : `https://maps.google.com/?q=${encodeURIComponent(`${s.address ?? s.businessName}, Toronto`)}`);

/** Street day: the ~30 shops of one area in walking order, one stop at a time, outcomes that work with no signal. */
export default function StreetDayPage() {
  return (
    <Suspense fallback={<Skeleton className="h-60 rounded-card" />}>
      <StreetDay />
    </Suspense>
  );
}

function StreetDay() {
  const router = useRouter();
  const toast = useToast();
  const areaParam = useSearchParams().get("area") ?? undefined;
  const [day, setDay] = useState<repApi.StreetDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedOutcome[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [pitch, setPitch] = useState(false);
  const [proof, setProof] = useState<repApi.PitchProof | null>(null);
  const [setupFor, setSetupFor] = useState<repApi.StreetStop | null>(null);
  const [setupAt, setSetupAt] = useState("");
  const [setupChannel, setSetupChannel] = useState<repApi.SetupChannel>("phone");
  const [pin, setPin] = useState<{ id: string; lat: number; lng: number } | null>(null);
  const queueRef = useRef<QueuedOutcome[]>([]);
  const flushing = useRef(false);

  const persist = useCallback((q: QueuedOutcome[]) => {
    queueRef.current = q;
    setQueue(q);
    saveQueue(q);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await browserApi.rep.streetDay(areaParam ? { neighbourhoodId: areaParam } : {});
      // Outcomes still waiting to be sent are applied on top so a refresh never "un-visits" a shop.
      let merged = d;
      for (const q of queueRef.current) merged = applyOutcome(merged, q);
      setDay(merged);
      setError(null);
      cacheDay(merged);
    } catch (e) {
      const cached = cachedDay();
      if (cached) setDay((cur) => cur ?? cached);
      else setError(e instanceof Error ? e.message : "Could not load the street day");
    }
  }, [areaParam]);

  const flush = useCallback(async () => {
    if (flushing.current || !queueRef.current.length) return;
    flushing.current = true;
    try {
      const r = await flushQueue(queueRef.current, (items) => browserApi.rep.syncOutcomes(items));
      // Remove only what the server confirmed: taps made while this request was in flight stay queued.
      const gone = new Set(r.confirmed);
      persist(queueRef.current.filter((x) => !gone.has(x.clientId)));
      if (r.sent && !r.failed) toast({ message: `${r.sent} saved`, tone: "success" });
      if (r.dropped.length) toast({ message: `${r.dropped.length} visit${r.dropped.length > 1 ? "s" : ""} could not be saved: the lead is no longer yours.`, tone: "error" });
      if (!r.failed) await load();
    } finally {
      flushing.current = false;
    }
  }, [load, persist, toast]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const q = loadQueue();
    queueRef.current = q;
    setQueue(q);
    const cached = cachedDay();
    if (cached && !areaParam) {
      let merged = cached;
      for (const x of q) merged = applyOutcome(merged, x);
      setDay(merged);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    void (async () => {
      await flush();
      await load();
    })();
    const on = () => {
      setOnline(true);
      void flush();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(() => void flush(), 30000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(t);
    };
  }, [flush, load, areaParam]);

  const open = useMemo(() => (day?.stops ?? []).filter((s) => !s.todayOutcome), [day]);
  const done = useMemo(() => (day?.stops ?? []).filter((s) => s.todayOutcome), [day]);
  const current = open.find((s) => s.id === currentId) ?? open[0] ?? null;

  useEffect(() => {
    if (!pitch || !day?.area) return;
    let live = true;
    browserApi.rep.proof({ neighbourhoodId: day.area.id }).then((p) => live && setProof(p)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pitch, day?.area]);

  async function record(stop: repApi.StreetStop, outcome: repApi.LeadOutcome, extra: Partial<repApi.LeadOutcomeBody> = {}) {
    const item: QueuedOutcome = { leadId: stop.id, label: stop.businessName, outcome, clientId: newClientId(), at: new Date().toISOString(), ...(pin?.id === stop.id ? { lat: pin.lat, lng: pin.lng } : {}), ...extra };
    setDay((d) => {
      if (!d) return d;
      const next = applyOutcome(d, item);
      cacheDay(next);
      return next;
    });
    setCurrentId(null);
    setPitch(false);
    persist(enqueue(queueRef.current, item));
    if (outcome === "signed_up") {
      await flush();
      router.push(`/rep/signup?leadId=${stop.id}`);
      return;
    }
    void flush();
  }

  function dropPin(stop: repApi.StreetStop) {
    if (!("geolocation" in navigator)) return toast({ message: "This phone can't share its location.", tone: "error" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPin({ id: stop.id, lat: p.coords.latitude, lng: p.coords.longitude });
        toast({ message: "Pinned. It is saved with your next tap.", tone: "success" });
      },
      () => toast({ message: "Location is off for this site.", tone: "error" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  if (error && !day) return <EmptyState title="Could not load the street day" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />;
  if (!day) return <Skeleton className="h-80 rounded-card" />;
  if (!day.area)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Street day" description="One street, all its shops, one day." />
        <EmptyState title="No street day is planned for you" description="An admin assigns the day in Areas. You can still work your own leads from the pipeline." action={<Button href="/rep/leads">Open leads</Button>} />
      </div>
    );

  const c = day.counts;
  const steps = current ? pitchSteps(proof, { name: current.businessName, vertical: current.vertical }) : [];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Street day"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{day.area.name} · {c.left} left · odd side up, even side back</span>
            {!online ? <span className="inline-flex items-center gap-1 rounded-full bg-location/10 px-2 py-0.5 text-caption font-medium text-location"><WifiOff aria-hidden className="size-3" />Offline</span> : null}
            {queue.length ? <span role="status" className="rounded-full bg-location/10 px-2 py-0.5 text-caption font-medium text-location">{queue.length} to sync</span> : null}
          </span>
        }
        actions={<Button size="sm" variant="secondary" href="/rep/leads">Pipeline</Button>}
      />
      <div className="flex items-center gap-3">
        <Meter value={c.visited} max={Math.max(c.total, 1)} label="Shops visited today" className="flex-1" />
        <span className="shrink-0 text-meta text-fg-muted tabular">{c.visited}/{c.total} visited · {c.signedUp} signed up · {c.comeBack} come back</span>
      </div>

      {current ? (
        <section aria-label="Next shop" className="rounded-card border border-fg p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label text-fg-muted">NEXT · {current.order} of {c.left}</p>
            {current.vertical ? <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-caption font-medium text-fg-muted">{current.vertical.replace(/_/g, " ")}</span> : null}
          </div>
          <h2 className="mt-1 font-display text-[26px] font-semibold leading-8 text-fg">{current.businessName}</h2>
          <p className="mt-1 text-meta text-fg-muted">
            {[current.address, current.contactName ? `owner ${current.contactName}` : null, current.language ? LANG[current.language] : null].filter(Boolean).join(" · ") || "No address yet"}
          </p>
          {current.activityCount ? <p className="mt-1 text-meta text-fg-muted">{current.activityCount} earlier touch{current.activityCount > 1 ? "es" : ""}{current.notes ? ` · ${current.notes.split("\n").pop()}` : ""}</p> : null}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="primary" iconStart={Phone} disabled={!current.phone} href={current.phone ? `tel:${current.phone}` : undefined}>Call</Button>
            <Button variant="secondary" iconStart={Navigation} href={mapsHref(current)}>Navigate</Button>
            <Button variant="secondary" iconStart={Presentation} onClick={() => setPitch(true)}>Pitch</Button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-label text-fg-muted">HOW DID IT GO?</p>
            {current.lat == null && pin?.id !== current.id ? (
              <button type="button" onClick={() => dropPin(current)} className="inline-flex min-h-11 items-center gap-1 text-meta-strong text-fg-muted hover:text-fg"><MapPin aria-hidden className="size-4" />Pin this door</button>
            ) : (
              <span className="text-meta text-fg-muted">{pin?.id === current.id ? "Pinned" : "Has a pin"}</span>
            )}
          </div>
          <Outcomes stop={current} record={record} askSetup={(s) => { setSetupFor(s); setSetupAt(""); }} />
        </section>
      ) : (
        <EmptyState title={c.total ? "Street day done" : "No shops on this street yet"} description={c.total ? `${c.visited} visited, ${c.signedUp} signed up, ${c.setupCalls} setup calls booked, ${c.comeBack} to come back to.` : "Add the shops you can see from the street as prospects, then walk them here."} action={<Button href="/rep/leads">Open leads</Button>} />
      )}

      {open.length > 1 ? (
        <Panel title="Up next" description="Tap one to go there first" padded={false}>
          <ul className="divide-y divide-line">
            {open.filter((s) => s.id !== current?.id).slice(0, 10).map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => { setCurrentId(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start hover:bg-bg-subtle">
                  <span className="w-6 shrink-0 text-meta text-fg-subtle tabular">{s.order}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg">{s.businessName}</span>
                    <span className="block truncate text-meta text-fg-muted">{s.address ?? "No address"}{s.nextActionAt ? ` · back ${new Date(s.nextActionAt).toLocaleDateString("en-CA", { weekday: "short" })}` : ""}</span>
                  </span>
                  {s.stage === "contacted" ? <span className="text-caption text-fg-muted">visited before</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {done.length ? (
        <Panel title="Done today" padded={false}>
          <ul className="divide-y divide-line">
            {done.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-body text-fg">{s.businessName}</span>
                <span className={cn("text-meta", s.todayOutcome === "signed_up" ? "text-positive-text" : "text-fg-muted")}>{repApi.OUTCOME_LABEL[s.todayOutcome!]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Sheet open={pitch && !!current} onClose={() => setPitch(false)} title={current?.businessName ?? ""} subtitle="Two-minute pitch" label="Pitch">
        <ol className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <li key={s.key}>
              <p className="text-body-strong text-fg">{i + 1} · {s.title}</p>
              {/* Read aloud at a shop counter, often outdoors: the same size as the canvas pitch frame. */}
              <p className="mt-1 text-[17px] leading-snug text-fg">{s.say}</p>
              {s.key === "proof" && proof ? (
                <dl className="mt-2 grid grid-cols-3 divide-x divide-line rounded-card border border-line">
                  {proofHighlights(proof).map((h) => (
                    <div key={h.label} className="px-3 py-2">
                      <dd className="text-[20px] font-semibold text-fg tabular">{h.value}</dd>
                      <dt className="text-caption text-fg-muted">{h.label}</dt>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
        {proof?.topShops.length ? <p className="mt-4 text-meta text-fg-muted">Busiest shops: {proof.topShops.filter((t) => t.members > 0).map((t) => `${t.name} (${t.members})`).join(", ") || "none yet"}.</p> : null}
        <p className="mt-4 text-label text-fg-muted">HOW DID IT GO?</p>
        {current ? <Outcomes stop={current} record={record} askSetup={(s) => { setPitch(false); setSetupFor(s); setSetupAt(""); }} /> : null}
      </Sheet>

      <ConfirmDialog
        open={!!setupFor}
        onClose={() => setSetupFor(null)}
        title="Book a setup call"
        body={setupFor ? `${setupFor.businessName}: when should we set it up together?` : undefined}
        confirmLabel="Book it"
        disabled={!setupAt}
        onConfirm={async () => {
          if (setupFor) await record(setupFor, "setup_call", { setupAt: new Date(setupAt).toISOString(), setupChannel });
        }}
      >
        <div className="flex flex-col gap-3">
          <TextField type="datetime-local" label="Date and time" value={setupAt} onChange={(e) => setSetupAt(e.target.value)} />
          <Select label="How" value={setupChannel} onChange={(e) => setSetupChannel(e.target.value as repApi.SetupChannel)} options={[{ value: "phone", label: "Phone call" }, { value: "whatsapp", label: "WhatsApp video" }, { value: "video", label: "Video call" }]} />
        </div>
      </ConfirmDialog>
      <p className="text-center text-caption text-fg-subtle"><Link href="/rep/signup" className="underline">Sign up a shop that is not on the list</Link></p>
    </div>
  );
}

function Outcomes({ stop, record, askSetup }: { stop: repApi.StreetStop; record: (s: repApi.StreetStop, o: repApi.LeadOutcome) => void; askSetup: (s: repApi.StreetStop) => void }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => record(stop, "signed_up")}>Sign up now</Button>
        <Button size="lg" variant="secondary" onClick={() => askSetup(stop)}>Book a setup call</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => record(stop, "come_back")}>Come back</Button>
        <Button variant="secondary" onClick={() => record(stop, "not_interested")}>Not interested</Button>
        <Button variant="secondary" onClick={() => record(stop, "not_in")}>Not in</Button>
      </div>
    </div>
  );
}
