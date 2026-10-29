"use client";
/** Settings, Weekly goal (docs/business/pro-value.md 3.2 P6): what the shop wants a week to bring in, and when the weekly report arrives. */
import { useState } from "react";
import { PLANS } from "@ll/shared";
import { BackLink, ErrorLine, PageHeader, Panel, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { dollarsToCents, weekdayLabel } from "@/lib/dashboard/insights";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export default function GoalSettingsPage() {
  const { api, base, role } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const { toast } = useToast();
  const manager = role !== "staff";
  const state = useApi(manager ? () => api.insights.week() : null, [api, manager]);
  const act = useAction();
  const [goal, setGoal] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<string | null>(null);
  const [hour, setHour] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  if (!manager) return <NoAccess />;

  const w = state.data;
  // Until the owner edits a field, it shows what is saved.
  const goalValue = goal ?? (w?.goal.cents ? String(Math.round(w.goal.cents / 100)) : "");
  const weekdayValue = weekday ?? String(w?.report.weekday ?? 0);
  const hourValue = hour ?? String(w?.report.hour ?? 18);
  const dirty = goal !== null || weekday !== null || hour !== null;

  async function save() {
    const cents = dollarsToCents(goalValue);
    if (cents === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const r = await act.run(() => api.insights.saveSettings({ weeklyGoalCents: cents, weeklyReportWeekday: Number(weekdayValue), weeklyReportHour: Number(hourValue) }));
    if (r) {
      setGoal(null);
      setWeekday(null);
      setHour(null);
      toast({ message: t("insights.goal.saved"), tone: "success" });
      void state.reload();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/settings`}>{t("insights.goal.back")}</BackLink>
      <PageHeader title={t("insights.goal.title")} description={t("insights.goal.description")} />
      {state.error ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
      {!w && state.loading ? <Panel><SkeletonRows rows={3} /></Panel> : null}
      {w ? (
        <Panel>
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextField
              label={t("insights.goal.amount")}
              hint={t("insights.goal.amountHelp")}
              inputMode="numeric"
              value={goalValue}
              error={invalid ? t("insights.goal.invalid") : null}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t("insights.goal.day")}
                value={weekdayValue}
                onChange={(e) => setWeekday(e.target.value)}
                options={Array.from({ length: 7 }, (_, d) => ({ value: String(d), label: weekdayLabel(loc.date, d) }))}
              />
              <Select
                label={t("insights.goal.hour")}
                value={hourValue}
                onChange={(e) => setHour(e.target.value)}
                options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: loc.date(new Date(Date.UTC(2024, 0, 1, h)), { hour: "numeric" }, "UTC") }))}
              />
            </div>
            <p className="text-meta text-fg-muted">{w.paid ? t("insights.goal.reportHint") : t("insights.goal.freeHint", { plan: PLANS.plus.name })}</p>
            {act.error ? <Banner tone="warning">{act.error}</Banner> : null}
            <div>
              <Button type="submit" size="md" loading={act.busy} disabled={!dirty}>
                {t("insights.goal.save")}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
