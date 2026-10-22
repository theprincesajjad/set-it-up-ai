"use client";
import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ToastOptions {
  message: string;
  tone?: "neutral" | "success" | "error";
  action?: { label: string; onClick: () => void };
  /** ms; default 4000 (8000 with an action). */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(t: ToastOptions | string) => void>(() => undefined);

/** `const toast = useToast(); toast("Saved")` — one visible at a time, new replaces old. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: ToastOptions | string) => {
    const opts = typeof t === "string" ? { message: t } : t;
    setToast({ ...opts, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), toast.duration ?? (toast.action ? 8000 : 4000));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);

  const Icon = toast?.tone === "success" ? CircleCheck : toast?.tone === "error" ? CircleAlert : null;
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-toast flex justify-center px-4 lg:justify-start lg:ps-6">
        <div role={toast?.tone === "error" ? "alert" : "status"} aria-live={toast?.tone === "error" ? "assertive" : "polite"} className="w-full max-w-[420px]">
          {toast ? (
            <div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-card bg-fg px-4 py-3 text-meta font-medium text-bg shadow-float motion-safe:animate-fade-in">
              {Icon ? <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} /> : null}
              <span className="flex-1">{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  className="text-meta-strong underline underline-offset-2 focus-visible:focus-ring"
                  onClick={() => {
                    toast.action?.onClick();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
