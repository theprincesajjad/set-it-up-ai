"use client";
import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { createToastManager, Toast as ToastRoot, ToastAction, ToastContent, ToastPortal, ToastProvider as ToastBaseProvider, ToastTitle, ToastViewport, useToastManager } from "@/components/primitives/toast";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  message: string;
  tone?: "neutral" | "success" | "error";
  action?: { label: string; onClick: () => void };
  /** ms; default 4000 (8000 with an action). */
  duration?: number;
}

type Show = (t: ToastOptions | string) => void;
const ToastContext = createContext<Show>(() => undefined);

/** `const toast = useToast(); toast("Saved")`: one visible at a time, new replaces old. */
export function useToast() {
  return useContext(ToastContext);
}

type Data = { tone: NonNullable<ToastOptions["tone"]>; action?: ToastOptions["action"] };

/** The black pill. Base UI owns the live region (polite viewport; errors are added with high priority and announce assertively), F6 focus and swipe. */
function ToastList() {
  const { toasts, close } = useToastManager<Data>();
  return toasts.map((t) => {
    const data = t.data;
    const Icon = data?.tone === "success" ? CircleCheck : data?.tone === "error" ? CircleAlert : null;
    return (
      <ToastRoot
        key={t.id}
        toast={t}
        className="rounded-card border-0 bg-fg text-bg shadow-float [--gap:0.5rem] focus-visible:ring-0 focus-visible:focus-ring"
      >
        <ToastContent className="gap-3 px-4 py-3">
          {Icon ? <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} /> : null}
          <ToastTitle className="min-w-0 flex-1 text-meta font-medium text-bg" />
          {data?.action ? (
            <ToastAction
              render={<button type="button" />}
              className={cn("relative inline-flex min-h-6 items-center text-meta-strong underline underline-offset-2 after:absolute after:-inset-3 after:content-[''] focus-visible:focus-ring")}
              onClick={() => {
                data.action?.onClick();
                close(t.id);
              }}
            >
              {data.action.label}
            </ToastAction>
          ) : null}
        </ToastContent>
      </ToastRoot>
    );
  });
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(() => createToastManager(), []);
  const last = useRef<string | null>(null);
  const show = useCallback<Show>(
    (t) => {
      const o = typeof t === "string" ? { message: t } : t;
      const tone = o.tone ?? "neutral";
      if (last.current) manager.close(last.current);
      last.current = manager.add<Data>({
        title: o.message,
        type: tone === "error" ? "error" : tone === "success" ? "success" : undefined,
        priority: tone === "error" ? "high" : "low",
        timeout: o.duration ?? (o.action ? 8000 : 4000),
        data: { tone, action: o.action },
      });
    },
    [manager],
  );
  return (
    <ToastContext.Provider value={show}>
      <ToastBaseProvider toastManager={manager} limit={1}>
        {children}
        <ToastPortal>
          <ToastViewport className="z-toast inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] mx-auto max-w-[420px] sm:inset-x-4 sm:end-auto sm:mx-auto lg:start-6 lg:mx-0">
            <ToastList />
          </ToastViewport>
        </ToastPortal>
      </ToastBaseProvider>
    </ToastContext.Provider>
  );
}
