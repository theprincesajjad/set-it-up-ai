"use client";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { appointmentsApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import {
  PX_PER_HOUR,
  columnAt,
  geometry,
  hourLabel,
  minutesAtY,
  movable,
  movedTimes,
  offSegments,
  parts,
  resizedEnd,
  timeOffBlocks,
  walkInGaps,
  type CalColumn,
} from "@/lib/dashboard/calendar";
import { AppointmentBlock } from "./AppointmentBlock";
import { StaffColumn } from "./StaffColumn";

type Appt = appointmentsApi.AppointmentDto;

type Drag = { id: string; kind: "move" | "resize"; startX: number; startY: number; dy: number; dx: number; origCol: number; col: number; moved: boolean };
const THRESHOLD = 5;

export interface MoveRequest {
  appt: Appt;
  startsAt: string;
  endsAt: string;
  /** Column the block was dropped on (a staff id, or null for Unassigned). */
  staffId: string | null;
  /** Day column (week view) the block was dropped on. */
  date: string;
}

/**
 * The time grid: an hour gutter and one column per stylist (or per day). 60 px per hour, 15-minute snap.
 * Pointer events only: press and drag a block to move it (also across columns), drag its bottom edge to resize,
 * click an empty cell to start a booking there. Order in the DOM is by column then time, which is the focus order.
 */
export function CalendarDay({
  columns,
  appts,
  window,
  today,
  now,
  selectedId,
  mobileIndex,
  onOpen,
  onEmptyClick,
  onMove,
  onResize,
}: {
  columns: CalColumn[];
  appts: Appt[];
  window: [number, number];
  /** Today's local date (draws the now line on that column). */
  today: string;
  now: Date;
  selectedId: string | null;
  /** On phones only this column shows. */
  mobileIndex: number;
  onOpen: (a: Appt) => void;
  onEmptyClick: (col: CalColumn, minutes: number) => void;
  onMove: (m: MoveRequest) => void;
  onResize: (a: Appt, endsAt: string) => void;
}) {
  const hours = Math.max(1, Math.ceil((window[1] - window[0]) / 60));
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const byId = useMemo(() => new Map(appts.map((a) => [a.id, a])), [appts]);

  const edges = useCallback(() => colRefs.current.map((c) => (c ? { left: c.getBoundingClientRect().left, right: c.getBoundingClientRect().right } : { left: 0, right: 0 })), []);

  const begin = (a: Appt, kind: Drag["kind"], e: ReactPointerEvent<HTMLElement>, colIndex: number) => {
    if (e.button !== 0 || !movable(a)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const d: Drag = { id: a.id, kind, startX: e.clientX, startY: e.clientY, dy: 0, dx: 0, origCol: colIndex, col: colIndex, moved: false };
    dragRef.current = d;
    setDrag(d);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const moved = d.moved || Math.abs(dy) > THRESHOLD || Math.abs(e.clientX - d.startX) > THRESHOLD;
      const box = edges();
      const hit = d.kind === "move" ? columnAt(e.clientX, box) : d.col;
      const col = hit < 0 ? d.col : hit;
      // How far the ghost slides sideways to sit over the column it would land in.
      const dx = d.kind === "move" && box[col] && box[d.origCol] ? box[col]!.left - box[d.origCol]!.left : 0;
      const next = { ...d, dy, dx, col, moved };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !d.moved) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const a = byId.get(d.id);
      if (!a) return;
      if (d.kind === "resize") {
        const end = resizedEnd(a, d.dy);
        if (end !== a.endsAt) onResize(a, end);
        return;
      }
      const t = movedTimes(a, d.dy);
      const target = columns[d.col];
      if (!target) return;
      // Dropped on another day (week view): keep the time of day, change the date.
      let { startsAt, endsAt } = t;
      const from = parts(a.startsAt).date;
      if (target.date !== from) {
        const days = Math.round((new Date(`${target.date}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
        startsAt = new Date(new Date(t.startsAt).getTime() + days * 86_400_000).toISOString();
        endsAt = new Date(new Date(t.endsAt).getTime() + days * 86_400_000).toISOString();
      }
      if (startsAt === a.startsAt && endsAt === a.endsAt && target.staffId === a.staffId) return;
      onMove({ appt: a, startsAt, endsAt, staffId: target.staffId, date: target.date });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [drag, byId, columns, edges, onMove, onResize]);

  const cols = columns.length || 1;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-bg" data-calendar>
      {/* Column headers */}
      <div className="grid grid-cols-[48px_minmax(0,1fr)] md:[grid-template-columns:48px_repeat(var(--n),minmax(0,1fr))] border-b border-line" style={{ "--n": cols } as React.CSSProperties}>
        <div aria-hidden className="border-e border-line" />
        {columns.map((c, i) => (
          <div key={c.key} className={cn("flex min-w-0 items-center gap-2.5 border-s border-line px-3 py-2.5 first:border-s-0", i !== mobileIndex && "max-md:hidden")}>
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[11px] font-semibold text-fg">
              {c.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-meta-strong text-fg">{c.title}</span>
              <span className="block truncate text-[11px] leading-4 text-fg-muted tabular">{c.subtitle}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)", minHeight: 360 }}>
        <div className="grid grid-cols-[48px_minmax(0,1fr)] md:[grid-template-columns:48px_repeat(var(--n),minmax(0,1fr))]" style={{ "--n": cols } as React.CSSProperties}>
          <div aria-hidden className="relative border-e border-line" style={{ height: hours * PX_PER_HOUR }}>
            {Array.from({ length: hours }, (_, i) => (
              <span key={i} className="absolute end-1.5 -translate-y-1/2 bg-bg px-0.5 text-[11px] leading-4 text-fg-muted first:translate-y-0" style={{ top: i * PX_PER_HOUR + (i === 0 ? 2 : 0) }}>
                {hourLabel(Math.floor(window[0] / 60) + i)}
              </span>
            ))}
          </div>
          {columns.map((c, i) => {
            const mine = appts
              .filter((a) => a.status !== "cancelled" && a.staffId === c.staffId && parts(a.startsAt).date === c.date)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const nowParts = parts(now);
            const showNow = c.date === today && nowParts.date === today && nowParts.minutes >= window[0] && nowParts.minutes <= window[1];
            return (
              <StaffColumn
                key={c.key}
                ref={(el) => {
                  colRefs.current[i] = el;
                }}
                label={`${c.title}, ${c.subtitle}`}
                hours={hours}
                window={window}
                off={c.staff ? offSegments(c.staff, c.date, window) : []}
                timeOff={c.staff ? timeOffBlocks(c.staff, c.date, window) : []}
                gaps={walkInGaps(c.staff, c.staffId, c.date, window, appts, now)}
                onGapClick={(g) => onEmptyClick(c, g.start)}
                nowMinute={showNow ? nowParts.minutes : null}
                hidden={i !== mobileIndex}
                onEmptyClick={(e, rectTop) => {
                  if (suppressClick.current) return;
                  onEmptyClick(c, minutesAtY(e.clientY - rectTop, window[0]));
                }}
              >
                {mine.map((a) => {
                  const g = geometry(a, c.date, window);
                  const active = drag?.id === a.id && drag.moved;
                  return (
                    <AppointmentBlock
                      key={a.id}
                      appt={a}
                      top={g.top}
                      height={active && drag.kind === "resize" ? Math.max(14, g.height + drag.dy) : g.height}
                      selected={selectedId === a.id}
                      dragging={!!active && drag.kind === "move"}
                      offsetY={active ? drag.dy : 0}
                      offsetX={active && drag.kind === "move" ? drag.dx : 0}
                      now={now}
                      movable={movable(a)}
                      onOpen={() => {
                        if (!suppressClick.current) onOpen(a);
                      }}
                      onDragStart={(e) => {
                        if ((e.target as HTMLElement).closest("[data-resize]")) return;
                        begin(a, "move", e, i);
                      }}
                      onResizeStart={(e) => begin(a, "resize", e, i)}
                    />
                  );
                })}
              </StaffColumn>
            );
          })}
        </div>
      </div>
    </div>
  );
}
