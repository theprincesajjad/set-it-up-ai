"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/**
 * Booking policies in one place, on Services & prices: how long before a visit a client can change it for free, the no-show fee, and
 * whether the checkout asks for a tip (and the tip choices). What a client reads before they book comes from here.
 */
export function PolicyCard() {
  const { api, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.appointments.settings(), [api]);
  const s = state.data;
  const [hours, setHours] = useState("");
  const [fee, setFee] = useState("");
  const [tips, setTips] = useState(true);
  const [presets, setPresets] = useState("");
  useEffect(() => {
    if (!s) return;
    // Load the saved policy into the form once it arrives.
    /* eslint-disable react-hooks/set-state-in-effect */
    setHours(String(s.cancelWindowHours));
    setFee(s.noShowFeeCents ? String(s.noShowFeeCents / 100) : "");
    setTips(s.tipsOn);
    setPresets(s.tipPresets.join(", "));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [s]);
  if (!s) return null;
  const list = presets.split(/[,\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 100).slice(0, 4);
  const feeCents = Math.round(Number(fee || 0) * 100);
  const dirty = Number(hours) !== s.cancelWindowHours || feeCents !== s.noShowFeeCents || tips !== s.tipsOn || list.join() !== s.tipPresets.join();
  return (
    <Panel title="Booking policies" description="What a client reads before they book, and what the checkout asks for.">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Free change or cancel until" inputMode="numeric" suffix="hours before" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} />
          <TextField label="No-show fee" optionalLabel inputMode="decimal" prefix="$" hint="Charged to the card they add. Leave empty for none." value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <Switch label="Ask for a tip at checkout" description="Goes to the person who did the visit. Never taxed, never earns points." checked={tips} onChange={setTips} />
        {tips ? <TextField label="Tip choices" suffix="%" hint="Up to four, like 10, 15, 20." value={presets} onChange={(e) => setPresets(e.target.value)} /> : null}
        <p className="text-caption text-fg-muted">Hours for each person are in <a className="underline underline-offset-2" href={`${base}/staff`}>Staff</a>.</p>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <div>
          <Button
            size="sm"
            loading={act.busy}
            disabled={!dirty || (tips && !list.length)}
            onClick={async () => {
              const r = await act.run(() => api.appointments.saveSettings({ cancelWindowHours: Number(hours || 0), noShowFeeCents: feeCents, tipsEnabled: tips, ...(tips ? { tipPresets: list } : {}) }));
              if (r) {
                toast({ message: "Policies saved", tone: "success" });
                await state.reload();
              }
            }}
          >
            Save policies
          </Button>
        </div>
      </div>
    </Panel>
  );
}
