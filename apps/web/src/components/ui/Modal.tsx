"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions: [Cancel] [Primary/Danger] with the main action on the right. */
  actions?: ReactNode;
  /** "dialog" = centred on md+ and sheet-style on phones; "sheet" = always a bottom sheet. */
  variant?: "dialog" | "sheet";
  size?: "sm" | "md";
}

/**
 * Modal / Sheet on the native <dialog>: focus trap, Escape, inert background and
 * focus restoration come from the browser (system.md §3 Modal + Sheet).
 */
export function Modal({ open, onClose, title, description, children, actions, variant = "dialog", size = "sm" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  const sheet = variant === "sheet";
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // scrim click
      }}
      className={cn(
        "z-modal m-0 max-h-[90dvh] w-full max-w-none overflow-visible bg-transparent p-0 text-fg backdrop:bg-overlay",
        "fixed inset-x-0 bottom-0 top-auto",
        !sheet && "md:inset-0 md:m-auto md:h-fit",
        size === "md" ? "md:max-w-[560px]" : "md:max-w-[480px]",
      )}
    >
      <div
        className={cn(
          "flex max-h-[90dvh] flex-col overflow-y-auto bg-surface-raised p-6 shadow-xl motion-safe:animate-sheet-up",
          "rounded-t-xl pb-[max(24px,env(safe-area-inset-bottom))]",
          !sheet && "md:rounded-xl md:pb-6 md:motion-safe:animate-fade-in",
        )}
      >
        <div aria-hidden className={cn("mx-auto -mt-4 mb-3 h-1 w-9 rounded-full bg-border-strong", !sheet && "md:hidden")} />
        <div className="mb-2 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-h3 text-fg">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-me-2 -mt-2 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-sunken focus-visible:focus-ring">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {description ? (
          <div id={descId} className="mb-4 text-body text-fg-muted">
            {description}
          </div>
        ) : null}
        {children}
        {actions ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div> : null}
      </div>
    </dialog>
  );
}

export function Sheet(props: Omit<ModalProps, "variant">) {
  return <Modal {...props} variant="sheet" />;
}
