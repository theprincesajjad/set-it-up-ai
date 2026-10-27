"use client";
import { ChevronLeft, ChevronRight, Plus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { AppointmentSheet } from "@/components/dashboard/calendar/AppointmentSheet";
import { CalendarDay, type MoveRequest } from "@/components/dashboard/calendar/CalendarDay";
import { CheckoutSheet } from "@/components/dashboard/calendar/CheckoutSheet";
import { NewAppointmentSheet } from "@/components/dashboard/calendar/NewAppointmentSheet";
import { WalkInSheet } from "@/components/dashboard/calendar/WalkInSheet";
import { useAppointments } from "@/components/dashboard/calendar/useAppointments";
import { useIsDesktop } from "@/components/dashboard/calendar/useIsDesktop";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { EmptyState, ErrorLine, PageHeader, Segmented, SidePanel, ToolbarButton } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  addDays,
  dateLabel,
  dayBounds,
  dayColumns,
  dayDescription,
  dayNumbers,
  todayOf,
  walkInGaps,
  weekColumns,
  weekStart,
  workWindow,
  parts,
} from "@/lib/dashboard/calendar";
import { useApi } from "@/lib/dashboard/useApi";

type Appt = appointmentsApi.AppointmentDto;

export default function CalendarPage() {
  return (
    <FeatureGate keys={["booking.appointments"]} title="Appointments">
      <Calendar />
    </FeatureGate>
  );
}

type Sheet = null | { kind: "new"; defaults: { date: string; minutes: number; staffId: string | null; petId?: string | null } } | { kind: "walkin" } | { kind: "checkout" };
type Ask = null | { kind: "staff" | "hours"; move: MoveRequest; message?: string };

function Calendar() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const desktop = useIsDesktop();
  const manager = role !== "staff";
  const staffState = useApi(() => api.appointments.staff(), [api]);
  const servicesState = useApi(() => api.appointments.services("appointment"), [api]);
  const settings = useApi(() => api.appointments.settings(), [api]);
  const [date, setDate] = useState(() => todayOf());
  const [view, setView] = useState<"day" | "week">("day");
  const [only, setOnly] = useState("");
  const [mobileIdx, setMobileIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [now, setNow] = useState(() => new Date());
  const pendingCheckout = useRef<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  // A link can open a given day (?date=2026-11-14), e.g. from a reminder or a bookmark.
  useEffect(() => {
    const d = new URLSearchParams(globalThis.location.search).get("date");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
    // ?appt=<id>&checkout=1 opens a visit and its checkout (the walk-in line's Done button links here).
    const q = new URLSearchParams(globalThis.location.search);
    // ?newFor=<petId>: the pet page's "Book groom" opens a new appointment for that dog.
    const nf = q.get("newFor");
    if (nf) setSheet({ kind: "new", defaults: { date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayOf(), minutes: 10 * 60, staffId: null, petId: nf } });
    const a = q.get("appt");
    if (a) {
      setSelectedId(a);
      if (q.get("checkout") === "1") pendingCheckout.current = a;
    }
  }, []);

  const staff = useMemo(() => staffState.data?.items ?? [], [staffState.data]);
  const today = todayOf(now);
  const chosenStaff = view === "week" ? (only || staff[0]?.userId || "") : only;
  const range = useMemo(() => {
    if (view === "day") return dayBounds(date);
    const ws = weekStart(date);
    return { from: dayBounds(ws).from, to: dayBounds(addDays(ws, 6)).to };
  }, [view, date]);
  const appts = useAppointments(api, staffState.data?.setup.ready ? range : null);
  const items = appts.items;
  const selected = items.find((a) => a.id === selectedId) ?? null;
  useEffect(() => {
    if (pendingCheckout.current && selectedId === pendingCheckout.current && items.some((i) => i.id === selectedId)) {
      pendingCheckout.current = null;
      // One-time: the deep link asked for this visit's checkout and it has now loaded.
      setSheet({ kind: "checkout" });
    }
  }, [selectedId, items]);

  const columns = useMemo(() => {
    if (view === "week") return weekColumns(weekStart(date), staff.find((s) => s.userId === chosenStaff) ?? null, items);
    return dayColumns(date, staff, items, { onlyStaff: only || null });
  }, [view, date, staff, items, only, chosenStaff]);
  const dayItems = useMemo(() => (view === "day" ? items.filter((a) => parts(a.startsAt).date === date) : items), [items, view, date]);
  const win = useMemo(() => {
    if (view === "day") return workWindow(date, staff, dayItems);
    return workWindow(date, staff.filter((s) => s.userId === chosenStaff), items);
  }, [view, date, staff, dayItems, items, chosenStaff]);
  const numbers = { ...dayNumbers(dayItems, now), gaps: view === "day" ? columns.reduce((n, c) => n + walkInGaps(c.staff, c.staffId, c.date, win, dayItems, now).length, 0) : 0 };

  // Open the chair that is in service (or the next one up) on first load, like the design.
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    if (primed || selectedId || !desktop || !items.length || date !== today) return;
    const pick = items.find((a) => a.status === "in_service") ?? items.find((a) => a.status === "arrived" || a.status === "booked");
    // One-time default selection once the day has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick) setSelectedId(pick.id);
    setPrimed(true);
  }, [items, primed, selectedId, desktop, date, today]);

  const step = view === "week" ? 7 : 1;
  const go = useCallback((n: number) => setDate((d) => addDays(d, n * step)), [step]);

  // Keyboard: left and right change day, n is a new appointment, w a walk-in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("dialog[open], [role=dialog]")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "n") {
        e.preventDefault();
        setSheet({ kind: "new", defaults: { date, minutes: Math.max(win[0], Math.ceil((parts(new Date()).minutes) / 15) * 15), staffId: only || null } });
      } else if (e.key === "w") {
        e.preventDefault();
        setSheet({ kind: "walkin" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, date, win, only]);

  const nameOf = (id: string | null) => staff.find((s) => s.userId === id)?.name ?? null;

  async function doMove(m: MoveRequest, opts: { confirmStaffChange?: boolean; force?: boolean } = {}) {
    const r = await appts.patch(
      m.appt.id,
      { startsAt: m.startsAt, endsAt: m.endsAt, ...(view === "day" ? { staffId: m.staffId } : {}), confirmStaffChange: !!opts.confirmStaffChange, force: !!opts.force },
      { startsAt: m.startsAt, endsAt: m.endsAt, ...(view === "day" ? { staffId: m.staffId, staffName: nameOf(m.staffId) } : {}) },
    );
    if (r.ok) return;
    if (isApiError(r.error) && r.error.code === "requested_staff") return setAsk({ kind: "staff", move: m });
    if (isApiError(r.error) && r.error.code === "outside_hours" && manager) return setAsk({ kind: "hours", move: m, message: errorMessage(r.error) });
    toast({ message: errorMessage(r.error), tone: "error" });
  }
  function onMove(m: MoveRequest) {
    const staffChanged = view === "day" && m.staffId !== m.appt.staffId;
    if (staffChanged && m.appt.requestedStaff && m.appt.staffId) return setAsk({ kind: "staff", move: m });
    void doMove(m);
  }
  async function onResize(a: Appt, endsAt: string) {
    const r = await appts.patch(a.id, { endsAt }, { endsAt });
    if (!r.ok) toast({ message: errorMessage(r.error), tone: "error" });
  }

  const refresh = async () => {
    await appts.reload();
    await staffState.reload();
  };

  if (staffState.error && !staffState.data) return <ErrorLine message={staffState.error} onRetry={staffState.reload} />;
  if (!staffState.data || !servicesState.data) return <PageSkeleton />;
  const setup = staffState.data.setup;
  const services = servicesState.data.items;

  if (!setup.ready) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader flush title="Calendar" description="Your day, one column per stylist." />
        <EmptyState
          title="Add your services and hours to open booking"
          description={`${setup.services ? "Services are set up. " : "No services yet. "}${setup.staffWithHours ? "Hours are set." : "No one has working hours yet."} The calendar opens once you have at least one of each.`}
          action={<Button size="sm" href={`${base}/services`}>Services and prices</Button>}
          secondaryAction={<Button size="sm" variant="secondary" href={`${base}/staff`}>Staff and hours</Button>}
        />
      </div>
    );
  }

  const mobileMax = Math.max(0, columns.length - 1);
  const mobileCol = Math.min(mobileIdx, mobileMax);
  const sheetOpen = !!selected;
  const panel = selected ? (
    <AppointmentSheet key={selected.id} appt={selected} staff={staff} onChanged={refresh} onCheckout={() => setSheet({ kind: "checkout" })} taxStatus={settings.data?.taxStatus} />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        flush
        title="Calendar"
        description={view === "day" ? dayDescription(date, numbers) : `Week of ${dateLabel(weekStart(date), { month: "long", day: "numeric" })}. ${items.filter((a) => a.status !== "cancelled").length} booked.`}
        actions={
          <>
            <Button variant="secondary" size="sm" iconStart={UserPlus} onClick={() => setSheet({ kind: "walkin" })}>Walk-in</Button>
            <Button size="sm" iconStart={Plus} onClick={() => setSheet({ kind: "new", defaults: { date, minutes: Math.max(win[0], 10 * 60), staffId: only || null } })}>New appointment</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={() => setDate(today)}>Today</ToolbarButton>
        <button type="button" aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => go(-1)} className="inline-flex size-8 items-center justify-center rounded-full text-fg hover:bg-bg-subtle focus-visible:focus-ring"><ChevronLeft aria-hidden className="size-4" /></button>
        <button type="button" aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => go(1)} className="inline-flex size-8 items-center justify-center rounded-full text-fg hover:bg-bg-subtle focus-visible:focus-ring"><ChevronRight aria-hidden className="size-4" /></button>
        <Segmented label="View" value={view} onChange={(v) => { setView(v); if (v === "week" && !only) setOnly(staff[0]?.userId ?? ""); }} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />
        <Select hideLabel label="Staff" value={view === "week" ? chosenStaff : only} onChange={(e) => setOnly(e.target.value)} options={[...(view === "week" ? [] : [{ value: "", label: "All staff" }]), ...staff.map((s) => ({ value: s.userId, label: s.name }))]} className="h-8 !min-h-0 py-0 text-meta" />
      </div>

      {/* One stylist at a time on a phone. */}
      {view === "day" && columns.length > 1 ? (
        <div role="tablist" aria-label="Stylist" className="flex gap-1.5 overflow-x-auto md:hidden">
          {columns.map((c, i) => (
            <button key={c.key} type="button" role="tab" aria-selected={i === mobileCol} onClick={() => setMobileIdx(i)} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-meta focus-visible:focus-ring", i === mobileCol ? "border-fg bg-fg font-medium text-bg" : "border-line bg-bg text-fg")}>
              {c.title}
            </button>
          ))}
        </div>
      ) : null}

      {appts.error && !appts.items.length ? <ErrorLine message={appts.error} onRetry={appts.reload} /> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <CalendarDay
          columns={columns}
          appts={dayItems}
          window={win}
          today={today}
          now={now}
          selectedId={selectedId}
          mobileIndex={mobileCol}
          onOpen={(a) => setSelectedId(a.id)}
          onEmptyClick={(col, minutes) => setSheet({ kind: "new", defaults: { date: col.date, minutes, staffId: col.staffId } })}
          onMove={onMove}
          onResize={onResize}
        />
        {desktop ? (
          <aside aria-label="Appointment" className="sticky top-4 hidden min-h-[480px] rounded-card border border-line bg-bg p-5 lg:block">
            {panel ?? <p className="text-meta text-fg-muted">Pick an appointment to see the client, what is due and the next step. Click an empty cell to book one.</p>}
          </aside>
        ) : null}
      </div>
      {!desktop && sheetOpen ? (
        <SidePanel open onClose={() => setSelectedId(null)} label="Appointment" title={selected!.customer.name} width={420}>
          {panel}
        </SidePanel>
      ) : null}

      <NewAppointmentSheet
        open={sheet?.kind === "new"}
        onClose={() => setSheet(null)}
        staff={staff}
        services={services}
        defaults={sheet?.kind === "new" ? sheet.defaults : { date, minutes: 10 * 60, staffId: null, petId: null }}
        onCreated={async (a) => {
          setSelectedId(a.id);
          await refresh();
        }}
      />
      <WalkInSheet
        open={sheet?.kind === "walkin"}
        onClose={() => setSheet(null)}
        staff={staff}
        services={services}
        defaultStaffId={only || null}
        onCreated={async (a) => {
          setDate(today);
          setSelectedId(a.id);
          await refresh();
        }}
      />
      {selected ? (
        <CheckoutSheet
          open={sheet?.kind === "checkout"}
          onClose={() => setSheet(null)}
          appt={selected}
          services={services}
          staff={staff}
          settings={settings.data}
          onDone={refresh}
        />
      ) : null}

      <Modal
        open={!!ask}
        onClose={() => setAsk(null)}
        title={ask?.kind === "staff" ? "Move them to someone else?" : "Outside working hours"}
        description={
          ask?.kind === "staff"
            ? `${ask.move.appt.customer.name} asked for ${ask.move.appt.staffName ?? "this stylist"} by name. Move them anyway?`
            : `${ask?.message ?? "That's outside their hours."} Move it anyway?`
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsk(null)}>Keep it</Button>
            <Button
              onClick={async () => {
                const a = ask;
                setAsk(null);
                if (a) await doMove(a.move, a.kind === "staff" ? { confirmStaffChange: true, force: manager } : { force: true, confirmStaffChange: true });
              }}
            >
              Move anyway
            </Button>
          </>
        }
      />
    </div>
  );
}
