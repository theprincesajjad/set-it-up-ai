"use client";
import { RouteError } from "@/components/errors";

/** Shop websites: a visitor screen. The words, the retry and the way out come from the one error system (components/errors). */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} audience="visitor" landmark />;
}
