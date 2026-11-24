"use client";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

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
  /** Override the title style (My card: Bricolage 800 17, canvas Card). */
  titleClassName?: string;
  /** Optional leading visual next to the title (e.g. the shop avatar on a shop sheet). */
  icon?: ReactNode;
}

/**
 * Modal / Sheet on Base UI Dialog (shadcn Dialog and Drawer family): focus trap, Escape, inert background
 * and focus restoration come from the primitive (system.md §3 Modal + Sheet). Same props as before.
 */
export function Modal({ open, onClose, title, description, children, actions, variant = "dialog", size = "sm", icon, titleClassName }: ModalProps) {
  const { t } = useLocaleOrEnglish();
  const sheet = variant === "sheet";
  // Focus goes back to what opened it. The popup is inert while it plays its exit, and the browser can drop focus to <body> before the
  // primitive hands it back (seen in testing), so the opener is remembered here and focused again if nothing else took focus.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      const el = document.activeElement;
      opener.current = el instanceof HTMLElement && el !== document.body && !el.closest('[data-slot="modal"]') ? el : null;
    }
  }, [open]);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    const id = requestAnimationFrame(() => {
      const el = opener.current;
      const now = document.activeElement;
      if (el?.isConnected && (!now || now === document.body || now.closest('[data-slot="modal"]'))) el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-modal bg-overlay transition-opacity duration-enter ease-out data-ending-style:opacity-0 data-ending-style:duration-tap data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          data-slot="modal"
          // While it plays its exit transition the popup is still mounted, but the page behind is live again: take the closing dialog out of
          // the accessibility tree and out of reach, so its buttons are never announced or matched next to the page's own (e.g. two
          // "Save changes" on Rewards for the 150ms after the confirm closes).
          aria-hidden={open ? undefined : true}
          inert={!open}
          className={cn(
            "fixed inset-x-0 bottom-0 z-modal mx-auto flex max-h-[90dvh] w-full flex-col overflow-y-auto overscroll-contain bg-bg px-4 pt-5 text-fg shadow-float outline-none sm:px-6",
            "rounded-t-sheet pb-[max(24px,env(safe-area-inset-bottom))]",
            // Enter and exit are transitions (they reverse if it is closed mid-way), not keyframes: a phone sheet slides up from the edge and back
            // down; from md up the dialog fades and settles from 96%, the floating sheet fades and rises 12px. Out is the short tap duration.
            "transition-[translate,scale,opacity] duration-enter ease-sheet data-ending-style:duration-tap data-ending-style:ease-out",
            "max-md:data-starting-style:translate-y-full max-md:data-ending-style:translate-y-full md:data-starting-style:opacity-0 md:data-ending-style:opacity-0",
            sheet ? "md:bottom-6 md:rounded-sheet md:data-starting-style:translate-y-3 md:data-ending-style:translate-y-3" : "md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-sheet md:p-6 md:data-starting-style:scale-[0.96] md:data-ending-style:scale-[0.96]",
            size === "md" ? "md:max-w-[560px]" : "md:max-w-[480px]",
          )}
        >
          <div aria-hidden className={cn("mx-auto -mt-2.5 mb-3 h-[5px] w-9 shrink-0 rounded-full bg-bg-muted", !sheet && "md:hidden")} />
          <div className="mb-2 flex items-start justify-between gap-4">
            {/* With an avatar, the description (italic kind) sits under the title, not under the avatar (W7). */}
            <div className="flex min-w-0 items-center gap-3">
              {icon}
              <div className="min-w-0">
                <DialogPrimitive.Title className={titleClassName ?? "text-title font-semibold text-fg"}>{title}</DialogPrimitive.Title>
                {icon && description ? <DialogPrimitive.Description render={<div />} className="text-meta text-fg-muted">{description}</DialogPrimitive.Description> : null}
              </div>
            </div>
            <DialogPrimitive.Close aria-label={t("sh.card.close")} className="press relative -me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted hover:bg-bg-muted hover:text-fg active:bg-bg-muted active:text-fg after:absolute after:-inset-2 after:content-[''] focus-visible:focus-ring">
              <X aria-hidden className="size-4" strokeWidth={2} />
            </DialogPrimitive.Close>
          </div>
          {description && !icon ? <DialogPrimitive.Description render={<div />} className="mb-4 text-body text-fg-muted">{description}</DialogPrimitive.Description> : null}
          {children}
          {actions ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet(props: Omit<ModalProps, "variant">) {
  return <Modal {...props} variant="sheet" />;
}
