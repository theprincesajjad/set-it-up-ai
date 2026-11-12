"use client";
import { RouteError } from "@/components/errors";

/** The door tablet and kiosk: a standalone screen with a way back to the counter. The words, the retry and the way out come from the one error system (components/errors). */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} audience="staff" landmark />;
}
