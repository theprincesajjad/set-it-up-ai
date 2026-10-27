"use client";
/**
 * /me/vehicles (docs/research/auto-care.md, Figma M1): the owner's cars with the odometer, what each shop says is due (by km or
 * months, whichever comes first, an estimate), and the shop's tire swap days and stored tires. The plate is optional and only the
 * shop's staff and the owner see it.
 */
import { useEffect, useState } from "react";
import { VEHICLE_USES, type autoApi } from "@ll/shared";
import { Heading, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

type Data = autoApi.MyVehiclesResponse;

export function MyVehicles() {
  const { t, date } = useFmt();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => browserApi.me.myVehicles().then(setData).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);
  const day = (ymd: string) => date(ymd, { month: "short", day: "numeric" }, "UTC");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Heading plain>{t("auto.my.title")}</Heading>
        <p className="text-body text-fg-muted">{t("auto.my.sub")}</p>
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {data && data.vehicles.length === 0 && !adding ? <p className="text-body text-fg-muted">{t("auto.my.empty")}</p> : null}
      <ul className="flex flex-col gap-4">
        {(data?.vehicles ?? []).map((v) => (
          <VehicleCard key={v.id} v={v} day={day} onChanged={load} onError={setError} />
        ))}
      </ul>
      {adding ? (
        <AddVehicle
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="secondary" size="lg" fullWidth onClick={() => setAdding(true)}>{t("auto.my.add")}</Button>
      )}
      {(data?.tireShops ?? []).map((s) => (
        <TireShop key={s.merchantId} shop={s} vehicles={data!.vehicles} day={day} onChanged={load} onError={setError} />
      ))}
      <p className="text-meta text-fg-muted">{t("auto.my.plateNote")}</p>
    </div>
  );
}

const TONE = { overdue: "text-negative", due_soon: "text-accent-text", ok: "text-fg", unknown: "text-fg-muted" } as const;
const DOT = { overdue: "bg-negative", due_soon: "bg-accent", ok: "bg-positive", unknown: "bg-fg-subtle" } as const;

function VehicleCard({ v, day, onChanged, onError }: { v: autoApi.MyVehicleDto; day: (ymd: string) => string; onChanged: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const { t, number } = useFmt();
  const [km, setKm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-col gap-3.5 rounded-card border border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-headline text-fg"><bdi>{v.label}</bdi></p>
          <p className="text-meta text-fg-muted">
            {v.plate ? <bdi>{v.plate} · </bdi> : null}
            {v.odometerKm != null && v.odometerOn ? t("auto.my.odoOn", { km: number(v.odometerKm), date: day(v.odometerOn) }) : t("auto.my.odoNone")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (!window.confirm(`${t("auto.my.remove")}: ${v.label}?`)) return;
            await browserApi.me.removeVehicle(v.id).catch((e) => onError(errorMessage(e)));
            await onChanged();
          }}
        >
          {t("auto.my.remove")}
        </Button>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(km.replace(/[^\d]/g, ""));
          if (!n) return;
          setBusy(true);
          onError(null);
          try {
            await browserApi.me.addMyReading(v.id, n);
            setKm("");
            await onChanged();
          } catch (err) {
            onError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField label={t("auto.my.odoLabel")} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" loading={busy} disabled={!km.trim()}>{t("auto.my.odoSave")}</Button>
      </form>
      {v.shops.map((s) => (
        <div key={s.merchantId} className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="text-meta-strong text-fg">{t("auto.my.reminders", { shop: s.shopName })}</p>
          <ul className="flex flex-col divide-y divide-line">
            {s.reminders.map((r) => (
              <li key={r.serviceKey} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-body text-fg">{r.label}</p>
                  <p className="text-meta text-fg-muted">{r.dueOn ? t("auto.my.due", { date: day(r.dueOn) }) : r.every}</p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-meta", TONE[r.status])}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", DOT[r.status])} />
                  {t(`auto.my.status.${r.status}` as never)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-muted">{t("auto.my.estimateNote")}</p>
        </div>
      ))}
    </li>
  );
}

function TireShop({ shop, vehicles, day, onChanged, onError }: { shop: autoApi.MyTireShopDto; vehicles: autoApi.MyVehicleDto[]; day: (ymd: string) => string; onChanged: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const { t } = useFmt();
  const [car, setCar] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const w = shop.window;
  async function book(d: string) {
    setBusy(d);
    onError(null);
    try {
      await browserApi.me.bookMySwap({ merchantId: shop.merchantId, vehicleId: car || null, day: d });
    } catch (e) {
      onError(isApiError(e) && e.code === "day_full" ? t("auto.tire.full.err") : errorMessage(e));
    } finally {
      setBusy(null);
      await onChanged();
    }
  }
  return (
    <section aria-label={t("auto.tire.title", { shop: shop.shopName })} className="flex flex-col gap-3 rounded-card border border-line px-4 py-4">
      <h2 className="text-headline text-fg"><bdi>{t("auto.tire.title", { shop: shop.shopName })}</bdi></h2>
      <p className="text-meta text-fg-muted">{t(w.name === "fall" ? "auto.tire.fall" : "auto.tire.spring", { from: day(w.start), to: day(w.end) })}</p>
      {shop.swaps.length ? (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {shop.swaps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-body text-fg">{t("auto.tire.booked", { date: day(s.day) })}{s.vehicleLabel ? <span className="text-meta text-fg-muted"> · {s.vehicleLabel}</span> : null}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await browserApi.me.cancelMySwap(s.id).catch((e) => onError(errorMessage(e)));
                  await onChanged();
                }}
              >
                {t("auto.my.cancel")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {shop.days.length === 0 ? (
        <p className="text-meta text-fg-muted">{w.open ? t("auto.tire.noDays") : t("auto.tire.nextWindow", { date: day(w.start) })}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {vehicles.length > 1 ? <Select label={t("auto.tire.which")} value={car} onChange={(e) => setCar(e.target.value)} options={vehicles.map((v) => ({ value: v.id, label: v.label }))} placeholder={t("auto.tire.which")} /> : null}
          <p className="text-meta-strong text-fg">{t("auto.tire.pickDay")}</p>
          <ul className="flex flex-wrap gap-2" aria-label={t("auto.tire.pickDay")}>
            {shop.days.slice(0, 14).map((d) => (
              <li key={d.day}>
                <Button variant="secondary" size="sm" disabled={d.full || busy !== null} loading={busy === d.day} onClick={() => void book(d.day)} aria-label={`${t("auto.tire.book")}: ${day(d.day)}, ${d.full ? t("auto.tire.full") : t("auto.tire.left", { n: d.free })}`}>
                  {day(d.day)} · {d.full ? t("auto.tire.full") : t("auto.tire.left", { n: d.free })}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {shop.sets.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-meta-strong text-fg">{t("auto.tire.stored")}</p>
          <ul className="flex flex-col divide-y divide-line">
            {shop.sets.map((s) => (
              <li key={s.id} className="py-2.5 text-body text-fg">
                {t("auto.tire.setLine", { rack: s.rack, season: t(`auto.season.${s.season}` as never), label: s.label ?? s.vehicleLabel ?? "" })}
                {s.treadMm != null ? <span className="text-meta text-fg-muted"> · {t("auto.tire.tread", { mm: `${s.treadMm.toFixed(1)} mm` })}{s.treadStatus === "replace_soon" ? `, ${t("auto.tire.treadSoon")}` : s.treadStatus === "wear_bar" ? `, ${t("auto.tire.treadBar")}` : ""}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function AddVehicle({ onDone, onCancel }: { onDone: () => Promise<unknown>; onCancel: () => void }) {
  const { t } = useFmt();
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [use, setUse] = useState<(typeof VEHICLE_USES)[number]>("personal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-line px-4 py-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (!make.trim() || !model.trim()) return;
        setBusy(true);
        setError(null);
        try {
          await browserApi.me.addVehicle({ year: year ? Number(year) : null, make: make.trim(), model: model.trim(), plate: plate.trim() || null, use });
          await onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <TextField label={t("auto.my.year")} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <TextField label={t("auto.my.make")} value={make} onChange={(e) => setMake(e.target.value)} error={tried && !make.trim() ? t("auto.my.err") : null} autoComplete="off" />
      </div>
      <TextField label={t("auto.my.model")} value={model} onChange={(e) => setModel(e.target.value)} error={tried && !model.trim() ? t("auto.my.err") : null} autoComplete="off" />
      <TextField label={t("auto.my.plate")} hint={t("auto.my.plateNote")} value={plate} onChange={(e) => setPlate(e.target.value)} autoComplete="off" />
      <Select label={t("auto.my.use")} value={use} onChange={(e) => setUse(e.target.value as (typeof VEHICLE_USES)[number])} options={[{ value: "personal", label: t("auto.my.usePersonal") }, { value: "rideshare", label: t("auto.my.useRideshare") }]} />
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>{t("auto.my.save")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("auto.my.cancel")}</Button>
      </div>
    </form>
  );
}
