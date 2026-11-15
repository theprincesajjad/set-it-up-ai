"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { FeatureKey } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { useToast } from "@/components/ui/Toast";
import { FeatureTeaser } from "./FeatureTeaser";
import { PageHeader } from "./kit";
import { useMerchant } from "./MerchantContext";

/** What to do first once a tool is on, by the feature that was unlocked. */
const FIRST_STEP: Partial<Record<FeatureKey, string>> = {
  "orders.order_ahead": "Add your first dish.",
  "booking.classes": "Add your first class.",
  "booking.walkin_queue": "Open the line.",
};

/** Paid pages: render children only when one of `keys` is enabled, else a quiet coming-soon notice. */
export function FeatureGate({ keys, children, title }: { keys: FeatureKey[]; children: ReactNode; title?: string }) {
  const { enabled } = useMerchant();
  const returning = useSearchParams().get("checkout") === "success";
  const on = keys.some(enabled);
  if (on) return <>{returning ? <Returned keys={keys} /> : null}{children}</>;
  // Back from the checkout before the payment has landed: say so and wait for it, instead of showing the lock again.
  if (returning) return <Waiting keys={keys} title={title} />;
  return <FeatureTeaser featureKey={keys[0]!} title={title} />;
}

function clearParam(path: string) {
  try {
    window.history.replaceState(window.history.state, "", path);
  } catch {
    /* ignore */
  }
}

/** The tool is on and the owner just paid: one confirmation, then the address is clean again. */
function Returned({ keys }: { keys: FeatureKey[] }) {
  const toast = useToast();
  const path = usePathname();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let plan: string | null = null;
    try {
      plan = sessionStorage.getItem("ll.checkout.plan");
      sessionStorage.removeItem("ll.checkout.plan");
    } catch {
      /* private mode */
    }
    const next = keys.map((k) => FIRST_STEP[k]).find(Boolean);
    toast({ message: `${plan ? `${plan} is on.` : "Your plan is on."}${next ? ` ${next}` : ""}`, tone: "success" });
    clearParam(path);
  }, [keys, path, toast]);
  return null;
}

/** Paid, the webhook not here yet: refresh the plan every few seconds for a minute. */
function Waiting({ keys, title }: { keys: FeatureKey[]; title?: string }) {
  const { refresh } = useMerchant();
  const [late, setLate] = useState(false);
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20) {
        clearInterval(timer);
        setLate(true);
        return;
      }
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  if (late) return <FeatureTeaser featureKey={keys[0]!} title={title} />;
  return (
    <div className="flex max-w-[680px] flex-col gap-6" data-testid="checkout-waiting">
      <PageHeader flush title={title ?? "Confirming your payment"} description="Your plan turns on as soon as the payment confirms. This page updates by itself." />
      <Banner tone="info">Payment received. Unlocking your tool.</Banner>
    </div>
  );
}
