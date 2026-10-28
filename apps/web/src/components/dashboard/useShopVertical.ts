"use client";
import { useMerchant } from "./MerchantContext";

/** The shop's vertical when inside the merchant dashboard, otherwise undefined (admin, BIA and rep consoles share the kit). */
export function useShopVertical(): string | undefined {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMerchant()?.detail?.merchant?.vertical;
  } catch {
    return undefined;
  }
}
