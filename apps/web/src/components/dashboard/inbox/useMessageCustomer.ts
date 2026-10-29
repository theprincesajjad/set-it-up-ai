"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";

/** "Message": open (or start) the customer's thread and go to it in the inbox. */
export function useMessageCustomer() {
  const { api, base } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function open(who: { memberId: string } | { userId: string }) {
    setBusy(true);
    try {
      const c = await api.inbox.start(who);
      router.push(`${base}/inbox?c=${encodeURIComponent(c.id)}`);
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return { open, busy };
}
