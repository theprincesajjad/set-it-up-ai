"use client";
/**
 * Dashboard kit: filters, tabs, side panel and the save bar.
 * Owner: workstream D. Moved verbatim from kit.tsx (workstream A split); no behaviour change.
 * Import from "@/components/dashboard/kit" (the barrel), not from this file.
 */
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Filter capsules row (Stripe / Square). Active = muted fill, never colour. */
export function Capsules<T extends string>({ options, value, onChange, label, className }: { options: { value: T; label: string; count?: number | null; /** Colour of the word while not selected: waiting on a customer (info) or a problem (negative). */ tone?: "info" | "negative" }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-meta transition-colors focus-visible:focus-ring",
              on ? "border-fg bg-fg font-medium text-bg" : cn("border-line bg-bg hover:bg-bg-subtle", o.tone === "info" ? "text-location" : o.tone === "negative" ? "text-negative" : "text-fg"),
            )}
          >
            {o.label}
            {o.count != null ? <span className={cn("tabular", on ? "text-bg/70" : "text-fg-muted")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented switch for ranges and views (h-8, muted track). */
export function Segmented<T extends string>({ options, value, onChange, label, className }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex min-h-8 max-w-full items-stretch rounded-input bg-bg-subtle p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-7 rounded-[8px] whitespace-nowrap px-2.5 py-1 text-meta leading-tight transition-colors focus-visible:focus-ring", o.value === value ? "bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--ll-color-line)]" : "text-fg-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs for in-page views. */
export function PageTabs<T extends string>({ items, value, onChange, label, className }: { items: { id: T; label: ReactNode; count?: number | null }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label}
            {t.count != null ? <span className="tabular text-fg-muted">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Right-side detail panel (Square customer directory). Full screen on phones. */
export function SidePanel({ open, onClose, title, subtitle, children, footer, label, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-overlay print:hidden">
      <button type="button" aria-label="Close panel" tabIndex={-1} className="absolute inset-0 cursor-default bg-fg/[0.06]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-y-0 end-0 flex w-full flex-col border-s border-line bg-bg shadow-float outline-none motion-safe:animate-fade-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-headline text-fg">{title}</div>
            {subtitle ? <div className="mt-0.5 truncate text-meta text-fg-muted">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-me-2 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Same props as ui/Tabs, drawn as the dashboard's underline tabs. */
export function Tabs({ items, value, onChange, label, className }: { items: { id: string; label: ReactNode; meta?: ReactNode }[]; value: string; onChange: (id: string) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-meta transition-colors focus-visible:focus-ring [&_span]:text-caption", on ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label}
            {t.meta != null ? <span className="font-normal text-fg-muted tabular">{t.meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}

/**
 * Sticky save bar for long forms: appears once `dirty`, pinned to the bottom of the content area
 * (clears the 240px sidebar on desktop). Pass the primary action as `children`.
 */
export function SaveBar({ dirty, message, error, onDiscard, children }: { dirty: boolean; message?: ReactNode; error?: string | null; onDiscard?: () => void; children: ReactNode }) {
  if (!dirty) return null;
  return (
    <div role="region" aria-label="Unsaved changes" className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-bg px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-8 lg:start-[240px] print:hidden">
      <div className="mx-auto flex max-w-[1136px] flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-fg" aria-live="polite">{error ? <span className="text-negative">{error}</span> : (message ?? "You have unsaved changes")}</p>
        <div className="flex gap-2">
          {onDiscard ? (
            <button type="button" onClick={onDiscard} className="inline-flex h-8 items-center rounded-input px-3 text-meta font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
              Discard
            </button>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
