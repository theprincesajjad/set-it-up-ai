"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** The code a customer shows staff, with a countdown (system.md §6 RedeemCode). */
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
      <div role="status" className="rounded-lg bg-success p-5 text-center text-on-success">
        <p className="text-h3">Enjoy your {rewardName}.</p>
      </div>
    );

  const spaced = code.length > 3 ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}` : code;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-label text-fg">{rewardName}</p>
      <div className="rounded-lg bg-surface-sunken px-6 py-4">
        <span aria-label={`Code ${code.split("").join(" ")}`} className="text-code tabular-nums text-fg">
          {spaced}
        </span>
      </div>
      <p className="text-body-sm text-fg-muted">Show this code to staff. Your points are used when they confirm.</p>
      {left !== null ? (
        <p className={cn("text-label tabular-nums", left <= 60 ? "text-on-warning-subtle" : "text-fg-muted")}>
          {left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "This code expired. Tap Redeem to get a new one."}
        </p>
      ) : null}
      {onCancel ? (
        <button type="button" onClick={onCancel} className="min-h-11 text-label text-fg-link underline underline-offset-2 focus-visible:focus-ring">
          Cancel and keep my points
        </button>
      ) : null}
    </div>
  );
}
