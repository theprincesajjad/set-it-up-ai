"use client";
import { useEffect, useState } from "react";
import { classesApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

const num = (v: string, fallback: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

/** Studio rules: the cancel window and late fee, the waitlist cutoff, freezes, the renewal notice and the extra terms printed on the agreement. */
export function ClassSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [s, setS] = useState<classesApi.ClassSettingsDto | null>(null);
  const [fee, setFee] = useState("0");
  useEffect(() => {
    if (!open) return;
    void api.classes.settings().then((r) => {
      setS(r);
      setFee(String(r.lateFeeCents / 100));
    });
  }, [open, api]);
  const set = (patch: Partial<classesApi.ClassSettingsDto>) => setS((cur) => (cur ? { ...cur, ...patch } : cur));
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Class rules"
      subtitle="Customers see these before they book and again in their agreement."
      label="Class rules"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!s}
            onClick={async () => {
              if (!s) return;
              const r = await act.run(() => api.classes.saveSettings({ ...s, lateFeeCents: Math.round(num(fee, 0) * 100) }));
              if (r) {
                toast({ message: "Class rules saved", tone: "success" });
                onClose();
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {s ? (
        <div className="flex flex-col gap-4">
          <TextField label="Free cancel until (hours before class)" type="number" min={0} max={72} value={String(s.cancelWindowHours)} onChange={(e) => set({ cancelWindowHours: num(e.target.value, 0) })} hint="Later than this, the class counts as used." />
          <TextField label="Late-cancel and no-show fee for members" type="number" min={0} prefix="$" value={fee} onChange={(e) => setFee(e.target.value)} hint="Charged to the member's card on file. 0 means no fee. Pack and drop-in students lose the class instead." />
          <TextField label="Stop promoting the waitlist (minutes before class)" type="number" min={0} value={String(s.waitlistCutoffMinutes)} onChange={(e) => set({ waitlistCutoffMinutes: num(e.target.value, 0) })} />
          <TextField label="Longest freeze (days)" type="number" min={7} max={90} value={String(s.freezeMaxDays)} onChange={(e) => set({ freezeMaxDays: num(e.target.value, 30) })} />
          <TextField label="Freezes a year" type="number" min={0} max={6} value={String(s.freezesPerYear)} onChange={(e) => set({ freezesPerYear: num(e.target.value, 2) })} />
          <TextField label="Renewal notice (days before a fixed term ends)" type="number" min={classesApi.RENEWAL_NOTICE_MIN_DAYS} max={classesApi.RENEWAL_NOTICE_MAX_DAYS} value={String(s.renewalNoticeDays)} onChange={(e) => set({ renewalNoticeDays: num(e.target.value, 60) })} hint="Ontario requires a notice 30 to 90 days before a fixed-term membership ends, or it cannot renew." />
          <TextField type="textarea" label="Extra terms on the agreement" optionalLabel maxLength={1500} showCount value={s.termsNote ?? ""} onChange={(e) => set({ termsNote: e.target.value || null })} hint="For example: bring your own mat, arrive 5 minutes early, women-only room rules." />
          <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
            <div>
              <p className="text-body text-fg">Award loyalty visit at check-in</p>
              <p className="text-meta text-fg-muted">Members earn their visit points when you check them in.</p>
            </div>
            <SwitchControl checked={s.awardOnCheckIn} onChange={(v) => set({ awardOnCheckIn: v })} ariaLabel="Award loyalty visit at check-in" />
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body text-fg">Reward every few classes</p>
                <p className="text-meta text-fg-muted">A milestone students want, like a free guest pass on their 10th class. It shows on their card and redeems at the desk.</p>
              </div>
              <SwitchControl checked={!!s.milestoneClasses} onChange={(v) => set(v ? { milestoneClasses: s.milestoneClasses ?? 10, milestoneRewardName: s.milestoneRewardName ?? "Free guest pass" } : { milestoneClasses: null })} ariaLabel="Reward every few classes" />
            </div>
            {s.milestoneClasses ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label="Every this many classes" type="number" min={2} max={500} value={String(s.milestoneClasses)} onChange={(e) => set({ milestoneClasses: Math.max(2, num(e.target.value, 10)) })} />
                <TextField label="Reward" value={s.milestoneRewardName ?? ""} onChange={(e) => set({ milestoneRewardName: e.target.value })} maxLength={80} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="skeleton h-40 w-full rounded-card" />
      )}
    </SidePanel>
  );
}
