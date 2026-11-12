"use client";
import { useRouter, usePathname } from "next/navigation";
import { useSyncExternalStore, useState, useTransition } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { sessionApi } from "@/lib/api/browser";
import { loginHref } from "@/lib/api/sessionEvents";

const subscribeNever = () => () => undefined;
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search);

/** Where you are now (path and query), safe to hand to /login?next=. Empty query on the server render, filled on the client. */
export function useCurrentPath(): string {
  const pathname = usePathname() ?? "/";
  const search = useSyncExternalStore(subscribeNever, readSearch, () => "");
  return `${pathname}${search}`;
}

/** The "Sign in again" target: /login?next=<current path and query>&reason=expired. */
export function useSignInAgainHref(): string {
  return loginHref(useCurrentPath(), { reason: "expired" });
}

/** "Sign in again": a real link to /login that brings the person back to this page. */
export function SignInAgainLink({ label, variant = "primary", size = "md" }: { label: string; variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  // A full page load on purpose: the session is gone, so nothing in the client router is worth keeping.
  return (
    <Button href={useSignInAgainHref()} variant={variant} size={size}>
      {label}
    </Button>
  );
}

/** "Try again" for a server-rendered failure: asks Next to render the segment again (and runs `onRetry` first, e.g. an error boundary's reset). */
export function RetryButton({ label, onRetry, variant = "primary", size = "md" }: { label: string; onRetry?: () => void; variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() =>
        start(() => {
          router.refresh();
          onRetry?.();
        })
      }
    >
      {label}
    </Button>
  );
}

/** "Sign in with a different account": signs the current account out, then opens /login that returns to `next`. */
export function SwitchAccountButton({ label, next, variant = "secondary", size = "md" }: { label: string; next?: string; variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const here = useCurrentPath();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await sessionApi.logout();
        } catch {
          // Already signed out, or offline: /login decides what to show.
        }
        window.location.assign(loginHref(next ?? here));
      }}
    >
      {label}
    </Button>
  );
}

/** "Go back": the browser's previous page, or `fallbackHref` when this tab has no history. */
export function GoBackButton({ label, fallbackHref = "/", variant = "ghost", size = "md" }: { label: string; fallbackHref?: string; variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const router = useRouter();
  return (
    <Button variant={variant} size={size} onClick={() => (window.history.length > 1 ? router.back() : window.location.assign(fallbackHref))}>
      {label}
    </Button>
  );
}
