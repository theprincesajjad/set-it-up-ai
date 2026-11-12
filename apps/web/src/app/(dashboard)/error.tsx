"use client";
import { RouteError } from "@/components/errors";

/** Above the shop dashboard layout (an outage while the shell loads): no shell is available, so a standalone screen. The words, the retry and the way out come from the one error system (components/errors). */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} audience="owner" landmark />;
}
