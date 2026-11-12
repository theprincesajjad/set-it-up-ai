"use client";
import { RouteError } from "@/components/errors";

/**
 * The root boundary: any uncaught render or server error that no group boundary caught. One component for every area, so the words and the
 * way out follow who is looking (shopper, owner, admin, visitor) and a reference code is shown for support. See components/errors.
 */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} landmark />;
}
