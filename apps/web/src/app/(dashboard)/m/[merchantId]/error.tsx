"use client";
import { RouteError } from "@/components/errors";

/** Inside the shop dashboard: the shell and its navigation stay, only the page is replaced. The words, the retry and the way out come from the one error system (components/errors). */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} audience="owner" />;
}
