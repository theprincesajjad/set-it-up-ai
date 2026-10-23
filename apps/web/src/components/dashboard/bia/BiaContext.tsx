"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { networkApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { useApi, type ApiState } from "@/lib/dashboard/useApi";

const KEY = "ll.bia.neighbourhood";

interface BiaValue {
  /** The neighbourhoods this user manages (admins: all). */
  managed: ApiState<{ items: networkApi.NeighbourhoodDto[] }>;
  /** The street the console is showing. Null until the list loads. */
  selected: networkApi.NeighbourhoodDto | null;
  select: (id: string) => void;
}

const Ctx = createContext<BiaValue | null>(null);

/**
 * Loads the neighbourhoods the user manages once for the whole BIA console and remembers which one is selected
 * (in this browser only). The switcher in the shell header and every page read it from here.
 */
export function BiaProvider({ children }: { children: ReactNode }) {
  const managed = useApi(() => browserApi.campaigns.managedNeighbourhoods(), []);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    try {
      // Restoring a saved choice after mount: localStorage does not exist on the server.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPicked(localStorage.getItem(KEY));
    } catch {
      // storage blocked: the first street is used
    }
  }, []);
  const items = managed.data?.items ?? [];
  const selected = items.find((n) => n.id === picked) ?? items[0] ?? null;
  const select = useCallback((id: string) => {
    setPicked(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // storage blocked: the choice lasts until the page reloads
    }
  }, []);
  const value = useMemo<BiaValue>(() => ({ managed, selected, select }), [managed, selected, select]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The BIA console state, or null outside the console (the shell then shows a plain title). */
export function useBiaOptional(): BiaValue | null {
  return useContext(Ctx);
}

export function useBia(): BiaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBia must be used inside <BiaProvider>");
  return v;
}
