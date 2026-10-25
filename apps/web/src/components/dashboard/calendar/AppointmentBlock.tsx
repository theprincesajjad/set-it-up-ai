"use client";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { appointmentsApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { blockLabel, serviceSummary, stateLine, timeRange } from "@/lib/dashboard/calendar";

type Appt = appointmentsApi.AppointmentDto;

const SURFACE: Record<string, string> = {
  booked: "bg-bg border border-line",
  arrived: "bg-bg-muted border border-line",
  in_service: "bg-bg-muted border-2 border-fg",
  completed: "bg-bg-muted border border-line text-fg-muted",
  no_show: "bg-bg border border-line",
  cancelled: "bg-bg border border-dashed border-line text-fg-muted",
};
const TONE = { plain: "text-fg-muted", positive: "text-positive-text", negative: "text-negative", muted: "text-fg-muted" } as const;

/** One appointment on the time grid: keyboard focusable, role button, drag to move, bottom edge to resize. */
export function AppointmentBlock({
  appt,
  top,
  height,
  selected,
  dragging,
  offsetY,
  offsetX,
  now,
  onOpen,
  onDragStart,
  onResizeStart,
  movable,
}: {
  appt: Appt;
  top: number;
  height: number;
  selected: boolean;
  dragging: boolean;
  /** Live vertical offset while dragging (px). */
  offsetY: number;
  /** Live horizontal offset while dragging across columns (px). */
  offsetX: number;
  now: Date;
  onOpen: () => void;
  onDragStart: (e: ReactPointerEvent<HTMLElement>) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void;
  movable: boolean;
}) {
  const line = stateLine(appt, now);
  const compact = height < 44;
  // A 15-minute block is only 14px tall: one 11px line, no padding, no resize grip competing for the space.
  const tiny = height < 24;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={blockLabel(appt)}
      aria-pressed={selected}
      data-appt={appt.id}
      data-status={appt.status}
      onClick={onOpen}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onPointerDown={movable ? onDragStart : undefined}
      className={cn(
        "absolute inset-x-1 select-none overflow-hidden rounded-[8px] px-2 text-start outline-none focus-visible:focus-ring",
        SURFACE[appt.status] ?? SURFACE.booked,
        movable && "cursor-grab touch-none active:cursor-grabbing",
        selected && appt.status !== "in_service" && "ring-2 ring-fg ring-offset-0",
        dragging && "z-20 opacity-90 shadow-float",
        !dragging && "z-10",
        tiny ? "flex items-center py-0" : "py-1",
      )}
      style={{ top, height, transform: dragging ? `translate(${offsetX}px, ${offsetY}px)` : undefined }}
    >
      <p className={cn("truncate font-semibold", tiny ? "min-w-0 text-[11px] leading-[12px]" : "text-[12px] leading-4", appt.status === "no_show" && "text-negative", appt.status === "completed" && "font-medium")}>
        {appt.customer.name}
        {compact ? <span className="font-normal text-fg-muted"> · {serviceSummary(appt)}</span> : null}
      </p>
      {!compact ? <p className="truncate text-[11px] leading-4 text-fg-muted">{serviceSummary(appt)}</p> : null}
      {!compact && height >= 58 ? (
        <p className="truncate text-[11px] leading-4 text-fg-muted tabular">
          {timeRange(appt)}
          {line.text ? <span className={TONE[line.tone]}> · {line.text}</span> : null}
        </p>
      ) : null}
      {movable && !tiny ? (
        <span
          data-resize
          aria-hidden
          onPointerDown={onResizeStart}
          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize touch-none items-end justify-center"
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-fg/20" />
        </span>
      ) : null}
    </div>
  );
}
