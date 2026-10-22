"use client";
import { useEffect, useState } from "react";
import type { networkApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";

let cache: Promise<networkApi.NeighbourhoodDto[]> | null = null;

/** Public neighbourhood list (names for ids, street names on QR stands), cached per page load. */
export function useNeighbourhoods(): networkApi.NeighbourhoodDto[] | null {
  const [items, setItems] = useState<networkApi.NeighbourhoodDto[] | null>(null);
  useEffect(() => {
    cache ??= browserApi.network.neighbourhoods().then((r) => r.items).catch(() => []);
    let live = true;
    void cache.then((v) => live && setItems(v));
    return () => {
      live = false;
    };
  }, []);
  return items;
}
