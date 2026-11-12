"use client";
import { RouteError } from "@/components/errors";

/** Customer pages and public link pages: a crash keeps the pass layout and footer. The words, the retry and the way out come from the one error system (components/errors). */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} audience="customer" />;
}
