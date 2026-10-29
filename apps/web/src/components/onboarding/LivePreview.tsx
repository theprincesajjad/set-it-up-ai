"use client";
import { Eye, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface LivePreviewProps {
  /** The real BookFlow in its read-only mode, with the shop's current data. */
  children: ReactNode;
  /** Changes whenever a field is saved: the content crossfades (160 ms). */
  version?: string | number;
  /** The glass pill on phones ("Preview"). */
  pillLabel: string;
  /** Accessible name of the frame. */
  frameLabel: string;
  closeLabel: string;
  className?: string;
}

/** The phone frame itself: 300 x 620, read-only (inert). */
export function PhoneFrame({ children, version, label, className }: { children: ReactNode; version?: string | number; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("relative h-[620px] w-[300px] shrink-0 overflow-hidden rounded-[36px] border-[6px] border-foreground bg-card shadow-card", className)} data-preview-frame>
      <div key={version} inert className="h-full w-full animate-in fade-in-0 overflow-hidden duration-[160ms] motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}

/**
 * Desktop: a sticky 300 x 620 phone frame, 24 from the top, in the right rail (it sits on the end edge, so in Urdu it moves to the left).
 * Phones: a bottom sheet opened from a glass pill (the only glass in onboarding, because it is chrome).
 */
export function LivePreview({ children, version, pillLabel, frameLabel, closeLabel, className }: LivePreviewProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <aside className={cn("sticky top-6 hidden self-start lg:block", className)} data-preview-rail>
        <PhoneFrame version={version} label={frameLabel}>{children}</PhoneFrame>
      </aside>
      <div className="lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="glass-lite fixed bottom-6 end-4 z-sticky inline-flex h-11 items-center gap-2 rounded-full px-4 text-body font-[550] text-foreground focus-visible:focus-ring">
          <Eye aria-hidden className="size-4" />
          {pillLabel}
        </button>
        {open ? (
          <div role="dialog" aria-modal="true" aria-label={frameLabel} className="fixed inset-0 z-modal flex items-end justify-center bg-scrim" onClick={() => setOpen(false)}>
            <div className="glass-sheet relative flex max-h-[92dvh] w-full flex-col items-center overflow-y-auto rounded-t-sheet px-4 pb-6 pt-4" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)} className="absolute end-3 top-3 grid size-11 place-items-center rounded-full text-foreground focus-visible:focus-ring">
                <X aria-hidden className="size-5" />
              </button>
              <PhoneFrame version={version} label={frameLabel} className="mt-8 origin-top max-[360px]:scale-90">{children}</PhoneFrame>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
