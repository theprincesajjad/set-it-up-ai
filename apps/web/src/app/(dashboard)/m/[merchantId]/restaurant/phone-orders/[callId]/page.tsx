"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";

/** Deep link to one call: the two-pane Phone orders screen opens on it. */
export default function CallPage() {
  const { callId } = useParams<{ callId: string }>();
  const { base } = useMerchant();
  const router = useRouter();
  useEffect(() => {
    router.replace(`${base}/restaurant/phone-orders?call=${encodeURIComponent(callId)}`);
  }, [router, base, callId]);
  return <p className="text-meta text-fg-muted">Opening the call...</p>;
}
