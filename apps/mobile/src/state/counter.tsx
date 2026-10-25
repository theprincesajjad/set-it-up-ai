/**
 * Counter mode state: chosen merchant + location, the active staff member
 * (PIN switcher on shared devices), the persisted offline queue and its
 * auto-sync loop, recent awards for Undo, and counter settings.
 */
import type { authApi, merchantApi, staffApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { OfflineQueue, type QueueSnapshot } from "../lib/offlineQueue";
import type { CounterProgram } from "../lib/award";
import { api, onStaffTokenExpired, staffTokenHolder } from "./api";
import { useOnline } from "./network";
import { qk } from "./query";
import { asyncQueueStorage, getJson, KEYS, setJson } from "./storage";

export interface CounterConfig {
  merchantId: string | null;
  merchantName: string | null;
  locationId: string | null;
  locationName: string | null;
  /** Street address of the location ("412 Roncesvalles Ave"), shown under the shop name. */
  locationAddress?: string | null;
  /** Shared shop device: staff switch with a PIN, exit needs a manager PIN. */
  sharedDevice: boolean;
  kiosk: boolean;
  theme: "light" | "dark";
  sound: boolean;
  /** Tablet front camera faces the customer: mirror the preview. */
  scannerFront: boolean;
}

const DEFAULT_CONFIG: CounterConfig = {
  merchantId: null,
  merchantName: null,
  locationId: null,
  locationName: null,
  sharedDevice: false,
  kiosk: false,
  theme: "light",
  sound: false,
  scannerFront: false,
};

export interface ActiveStaff {
  userId: string;
  name: string | null;
  role: authApi.StaffRole;
  viaPin: boolean;
}

export interface RecentAward {
  key: string;
  transactionId: string | null;
  label: string;
  who: string;
  at: number;
  undone?: boolean;
  queued?: boolean;
}

interface CounterValue {
  ready: boolean;
  config: CounterConfig;
  setConfig: (patch: Partial<CounterConfig>) => void;
  merchant: merchantApi.MerchantDetail | null;
  program: CounterProgram | null;
  programPaused: boolean;
  merchantLoading: boolean;
  staff: ActiveStaff | null;
  setStaffFromPin: (res: authApi.StaffPinVerifyResponse) => void;
  setDeviceStaff: (s: ActiveStaff | null) => void;
  lockStaff: () => void;
  online: boolean;
  queue: OfflineQueue;
  queueState: QueueSnapshot;
  flush: (force?: boolean) => Promise<void>;
  sentJustNow: number;
  recent: RecentAward[];
  addRecent: (r: RecentAward) => void;
  markUndone: (key: string) => void;
  touch: () => void;
  cacheMembers: (query: string, members: staffApi.MemberSummaryDto[]) => void;
  cachedMember: (query: string) => staffApi.MemberSummaryDto | null;
}

const CounterContext = createContext<CounterValue | null>(null);
const queue = new OfflineQueue(asyncQueueStorage);
const IDLE_MS = 15 * 60 * 1000;
const MEMBER_CACHE_MAX = 200;

export function CounterProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<CounterConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<ActiveStaff | null>(null);
  const [queueState, setQueueState] = useState<QueueSnapshot>(queue.snapshot());
  const [sentJustNow, setSentJustNow] = useState(0);
  const [recent, setRecent] = useState<RecentAward[]>([]);
  const memberCache = useRef<Record<string, staffApi.MemberSummaryDto>>({});
  const lastTouch = useRef(Date.now());
  const online = useOnline();

  useEffect(() => {
    (async () => {
      const saved = await getJson<Partial<CounterConfig>>(KEYS.counter);
      memberCache.current = (await getJson<Record<string, staffApi.MemberSummaryDto>>(KEYS.memberCache)) ?? {};
      setConfigState({ ...DEFAULT_CONFIG, ...(saved ?? {}) });
      await queue.load();
      setReady(true);
    })();
    return queue.subscribe(setQueueState);
  }, []);

  const setConfig = useCallback((patch: Partial<CounterConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      void setJson(KEYS.counter, next);
      return next;
    });
  }, []);

  const merchantId = config.merchantId;
  const merchantQ = useQuery({
    queryKey: qk.counterMerchant(merchantId ?? "none"),
    queryFn: () => api.merchant.detail(merchantId!),
    enabled: !!merchantId,
    staleTime: 5 * 60_000,
  });
  const merchant = merchantQ.data ?? null;
  const program: CounterProgram | null = merchant?.program
    ? {
        earnType: merchant.program.earnType,
        terminology: merchant.program.terminology,
        pointsPerDollar: merchant.program.pointsPerDollar,
        pointsPerVisit: merchant.program.pointsPerVisit,
        minSpendCents: merchant.program.minSpendCents,
        stampGoal: merchant.program.stampGoal,
        active: merchant.program.active,
        counterAutoStamp: merchant.program.counterAutoStamp,
      }
    : null;
  const programPaused = merchant ? merchant.merchant.status === "paused" || merchant.program?.active === false : false;

  const flush = useCallback(
    async (force = false) => {
      if (!merchantId) return;
      const res = await queue.flush((mId, events) => api.counter.sync(mId, events), { force });
      const sent = res.sentKeys ?? {};
      if (Object.keys(sent).length > 0) {
        // Recent strip: "Waiting" → sent, with the real transaction id so Undo works from Today.
        setRecent((prev) => prev.map((r) => (r.queued && r.key in sent ? { ...r, queued: false, transactionId: sent[r.key] ?? null } : r)));
      }
      if (res.sent > 0) {
        setSentJustNow(res.sent);
        setTimeout(() => setSentJustNow(0), 2000);
      }
    },
    [merchantId],
  );

  // Back online → send everything now. While items wait, poll on the backoff schedule.
  useEffect(() => {
    if (online && ready) void flush(true);
  }, [online, ready, flush]);
  useEffect(() => {
    if (!ready || queueState.pendingCount === 0) return;
    const due = queue.nextDueAt();
    const wait = Math.max(1000, (due ?? Date.now() + 5000) - Date.now());
    const t = setTimeout(() => void flush(false), wait);
    return () => clearTimeout(t);
  }, [ready, queueState, flush]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void flush(true);
    });
    return () => sub.remove();
  }, [flush]);

  // Shared devices: back to the PIN screen after 15 min idle or when the PIN token expires.
  useEffect(() => onStaffTokenExpired(() => setStaff((s) => (s?.viaPin ? null : s))), []);
  useEffect(() => {
    if (!config.sharedDevice) return;
    const t = setInterval(() => {
      if (Date.now() - lastTouch.current > IDLE_MS) {
        staffTokenHolder.clear();
        setStaff(null);
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [config.sharedDevice]);

  const value = useMemo<CounterValue>(
    () => ({
      ready,
      config,
      setConfig,
      merchant,
      program,
      programPaused,
      merchantLoading: merchantQ.isLoading,
      staff,
      setStaffFromPin: (res) => {
        staffTokenHolder.set({ accessToken: res.accessToken, accessTokenExpiresAt: res.accessTokenExpiresAt });
        lastTouch.current = Date.now();
        setStaff({ userId: res.staff.userId, name: res.staff.name, role: res.staff.role, viaPin: true });
      },
      setDeviceStaff: (s) => {
        staffTokenHolder.clear();
        setStaff(s);
      },
      lockStaff: () => {
        staffTokenHolder.clear();
        setStaff(null);
      },
      online,
      queue,
      queueState,
      flush,
      sentJustNow,
      recent,
      addRecent: (r) => setRecent((prev) => [r, ...prev].slice(0, 5)),
      markUndone: (key) => setRecent((prev) => prev.map((r) => (r.key === key ? { ...r, undone: true } : r))),
      touch: () => {
        lastTouch.current = Date.now();
      },
      cacheMembers: (query, members) => {
        const next = { ...memberCache.current };
        for (const m of members) {
          next[query] = m;
          next[`code:${m.memberCode}`] = m;
        }
        const keys = Object.keys(next);
        if (keys.length > MEMBER_CACHE_MAX) for (const k of keys.slice(0, keys.length - MEMBER_CACHE_MAX)) delete next[k];
        memberCache.current = next;
        void setJson(KEYS.memberCache, next);
      },
      cachedMember: (query) => memberCache.current[query] ?? null,
    }),
    [ready, config, setConfig, merchant, program, programPaused, merchantQ.isLoading, staff, online, queueState, flush, sentJustNow, recent],
  );

  return <CounterContext.Provider value={value}>{children}</CounterContext.Provider>;
}

export function useCounter(): CounterValue {
  const v = useContext(CounterContext);
  if (!v) throw new Error("useCounter outside CounterProvider");
  return v;
}
