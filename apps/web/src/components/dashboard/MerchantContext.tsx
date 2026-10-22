"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { authApi, FeatureKey, merchantApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { enabledSet, type StaffRole } from "@/lib/dashboard/nav";

export interface MerchantCtx {
  merchantId: string;
  base: string;
  me: authApi.MeResponse;
  detail: merchantApi.MerchantDetail;
  features: merchantApi.MerchantFeaturesResponse;
  role: StaffRole;
  /** Admin or rep viewing a shop they aren't staff at (impersonation banner). */
  viewingAs: "admin" | "rep" | null;
  api: MerchantEndpoints;
  enabled: (k: FeatureKey) => boolean;
  feature: (k: FeatureKey) => merchantApi.MerchantFeature | undefined;
  refresh: () => Promise<void>;
  setDetail: (d: merchantApi.MerchantDetail) => void;
}

const Ctx = createContext<MerchantCtx | null>(null);

export function useMerchant(): MerchantCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMerchant() outside the merchant dashboard");
  return c;
}

export function MerchantProvider({ me, initialDetail, initialFeatures, role, viewingAs, children }: { me: authApi.MeResponse; initialDetail: merchantApi.MerchantDetail; initialFeatures: merchantApi.MerchantFeaturesResponse; role: StaffRole; viewingAs: "admin" | "rep" | null; children: ReactNode }) {
  const [detail, setDetail] = useState(initialDetail);
  const [features, setFeatures] = useState(initialFeatures);
  const merchantId = detail.merchant.id;
  const api = useMemo(() => browserApi.merchant(merchantId), [merchantId]);
  const set = useMemo(() => enabledSet(features.features), [features]);
  const refresh = useCallback(async () => {
    const [d, f] = await Promise.all([api.detail(), api.features()]);
    setDetail(d);
    setFeatures(f);
  }, [api]);
  const value = useMemo<MerchantCtx>(
    () => ({
      merchantId,
      base: `/m/${merchantId}`,
      me,
      detail,
      features,
      role,
      viewingAs,
      api,
      enabled: (k) => set.has(k),
      feature: (k) => features.features.find((f) => f.key === k),
      refresh,
      setDetail,
    }),
    [merchantId, me, detail, features, role, viewingAs, api, set, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
