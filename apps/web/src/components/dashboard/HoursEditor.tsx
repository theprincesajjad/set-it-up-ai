"use client";
import { Switch } from "@/components/ui/Switch";
import { inputBase } from "@/components/ui/TextField";
import { DAY_LABEL, DAY_ORDER, type HoursDraft } from "@/lib/dashboard/hours";

export function HoursEditor({ value, onChange }: { value: HoursDraft; onChange: (v: HoursDraft) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label text-fg">Opening hours</legend>
      {DAY_ORDER.map((d) => {
        const v = value[d];
        return (
          <div key={d} className="grid grid-cols-[96px_1fr] items-center gap-2 sm:grid-cols-[110px_160px_1fr]">
            <span className="text-body text-fg">{DAY_LABEL[d]}</span>
            <Switch label={v.closed ? "Closed" : "Open"} checked={!v.closed} onChange={(on) => onChange({ ...value, [d]: { ...v, closed: !on } })} />
            {!v.closed ? (
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <input aria-label={`${DAY_LABEL[d]} opens`} type="time" value={v.open} onChange={(e) => onChange({ ...value, [d]: { ...v, open: e.target.value } })} className={inputBase} />
                <span aria-hidden>–</span>
                <input aria-label={`${DAY_LABEL[d]} closes`} type="time" value={v.close} onChange={(e) => onChange({ ...value, [d]: { ...v, close: e.target.value } })} className={inputBase} />
              </div>
            ) : (
              <span className="col-span-2 hidden sm:col-span-1 sm:block" />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
