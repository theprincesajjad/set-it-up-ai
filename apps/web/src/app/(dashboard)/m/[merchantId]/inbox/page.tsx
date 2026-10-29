"use client";
import { Suspense } from "react";
import { InboxView } from "@/components/dashboard/inbox/InboxView";

/** The inbox: every conversation with a customer, Instagram DMs (read-only) and "Create booking" from a message. Free on every plan. */
export default function InboxPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
