"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
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
 * Modal / Sheet on the native <dialog>: focus trap, Escape, inert background and
 * focus restoration come from the browser (system.md §3 Modal + Sheet).
 */
export function Modal({ open, onClose, title, description, children, actions, variant = "dialog", size = "sm", icon, titleClassName }: ModalProps) {
  const { t } = useLocaleOrEnglish();
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
        "fixed inset-x-0 bottom-0 top-auto mx-auto",
        !sheet && "md:inset-0 md:m-auto md:h-fit",
        size === "md" ? "md:max-w-[560px]" : "md:max-w-[480px]",
      )}
    >
      <div
        className={cn(
          "flex max-h-[90dvh] flex-col overflow-y-auto bg-bg px-4 pt-5 shadow-float motion-safe:animate-sheet-up sm:px-6",
          "rounded-t-sheet pb-[max(24px,env(safe-area-inset-bottom))]",
          sheet && "md:rounded-sheet md:mb-6",
          !sheet && "md:rounded-sheet md:p-6 md:motion-safe:animate-fade-in",
        )}
      >
        <div aria-hidden className={cn("mx-auto -mt-2.5 mb-3 h-[5px] w-9 shrink-0 rounded-full bg-bg-muted", !sheet && "md:hidden")} />
        <div className="mb-2 flex items-start justify-between gap-4">
          {/* With an avatar, the description (italic kind) sits under the title, not under the avatar (W7). */}
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              <h2 id={titleId} className={titleClassName ?? "text-title font-semibold text-fg"}>
                {title}
              </h2>
              {icon && description ? (
                <div id={descId} className="text-meta text-fg-muted">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("sh.card.close")} className="relative -me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg after:absolute after:-inset-2 after:content-[''] focus-visible:focus-ring">
            <X aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
        {description && !icon ? (
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
