"use client";
import { Check, type LucideIcon } from "lucide-react";
import { PLANS } from "@ll/shared";
import { useState, type ReactNode } from "react";
import { Badge, ComingSoonBadge } from "./Badge";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";

export interface LockedFeatureProps {
  icon: LucideIcon;
  title: string;
  /** One line: what it does + why it isn't here yet. */
  description: ReactNode;
  /** hidden → "Coming soon"; beta → "In beta"; plan → "Available on Pro · $39/mo". */
  state?: "hidden" | "beta" | "plan";
  planLabel?: string;
  network?: { current: number; target: number } | null;
  /** Records interest. Resolve to flip the button to "We'll let you know". */
  onNotify?: () => void | Promise<void>;
  notified?: boolean;
  learnMoreHref?: string;
  onTryBeta?: () => void;
  seePlansHref?: string;
}

/**
 * "Coming soon" card for unreleased / paid features. Never "Upgrade", never a
 * price headline, never a red lock (system.md §6 LockedFeature).
 */
export function LockedFeature({ icon: Icon, title, description, state = "hidden", planLabel, network, onNotify, notified: notifiedProp, learnMoreHref, onTryBeta, seePlansHref }: LockedFeatureProps) {
  const [notified, setNotified] = useState(!!notifiedProp);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-card border border-border bg-background p-4 md:p-5">
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-headline text-foreground">{title}</h3>
            {state === "hidden" ? <ComingSoonBadge /> : state === "beta" ? <Badge tone="info" dot>In beta</Badge> : <Badge tone="neutral">{planLabel ?? `Available on ${PLANS.plus.name}`}</Badge>}
          </div>
          <p className="mt-1 text-meta text-muted-foreground">{description}</p>
          {network ? (
            <ProgressBar className="mt-3" value={network.current} max={network.target} label="Shops joined" valueText={`${network.current} of ${network.target} shops have joined`} />
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "hidden" && onNotify ? (
              <Button
                variant="secondary"
                size="sm"
                iconStart={notified ? Check : undefined}
                loading={busy}
                disabled={notified}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onNotify();
                    setNotified(true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {notified ? "We'll let you know" : "Notify me"}
              </Button>
            ) : null}
            {state === "beta" && onTryBeta ? (
              <Button variant="secondary" size="sm" onClick={onTryBeta}>
                Try the beta
              </Button>
            ) : null}
            {state === "plan" && seePlansHref ? (
              <Button variant="ghost" size="sm" href={seePlansHref}>
                See plans
              </Button>
            ) : null}
            {learnMoreHref ? (
              <Button variant="ghost" size="sm" href={learnMoreHref}>
                Learn more
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
