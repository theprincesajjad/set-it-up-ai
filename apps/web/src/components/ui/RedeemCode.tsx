"use client";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** The code a customer shows staff, with a countdown (system.md §6 RedeemCode). v2: big mono code on a grey block. */
export function RedeemCode({ code, rewardName, expiresAt, onExpired, onCancel, status = "issued" }: { code: string; rewardName: string; expiresAt?: string | null; onExpired?: () => void; onCancel?: () => void; status?: "issued" | "used" | "void" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const left = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null;
  useEffect(() => {
    if (left === 0) onExpired?.();
  }, [left, onExpired]);

  if (status === "used")
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-fg text-bg">
          <Check className="size-6" strokeWidth={2.5} />
        </span>
        <p className="text-headline text-fg">Enjoy your {rewardName}.</p>
      </div>
    );

  const spaced = code.length > 3 ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}` : code;
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <p className="text-meta text-fg-muted">{rewardName}</p>
      <div className="w-full rounded-card bg-bg-subtle px-6 py-6">
        <span aria-label={`Code ${code.split("").join(" ")}`} className="font-mono text-[40px] font-semibold leading-none tracking-[0.12em] tabular-nums text-fg">
          {spaced}
        </span>
      </div>
      <p className="text-meta text-fg-muted">Show this code to staff. Your points are used when they confirm.</p>
      {left !== null ? (
        <p className={cn("text-meta-strong tabular-nums", left <= 60 ? "text-negative" : "text-fg")}>
          {left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "This code expired. Tap Redeem to get a new one."}
        </p>
      ) : null}
      {onCancel ? (
        <button type="button" onClick={onCancel} className="min-h-11 text-meta-strong text-fg-muted underline underline-offset-2 hover:text-fg focus-visible:focus-ring">
          Cancel and keep my points
        </button>
      ) : null}
    </div>
  );
}
