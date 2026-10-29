"use client";
/**
 * Owner-side helpers for the waitlist (phase-pro P2): the API bound to the shop, the sidebar row, and the small formatters the page,
 * the calendar chip and the cancel confirm share.
 */
import { ListPlus, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import type { MessageKey, waitlistApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { browserClient } from "@/lib/api/browser";
import { waitlistEndpoints } from "@/lib/api/waitlist";
import type { NavEntry } from "@/lib/dashboard/nav";

/** The waitlist API for the shop on screen. */
export function useWaitlistApi() {
  const { detail } = useMerchant();
  const id = detail.merchant.id;
  return useMemo(() => waitlistEndpoints(browserClient, id), [id]);
}

/** The sidebar icon (MerchantShell's ICONS map). */
export const WAITLIST_ICON: LucideIcon = ListPlus;

/** Put "Waitlist" under Calendar for owners and managers, when the shop has the calendar in its sidebar. Mutates `entries`. */
export function insertWaitlistNav(entries: NavEntry[], base: string, role: string, label: string): void {
  if (role !== "owner" && role !== "manager") return;
  const at = entries.findIndex((e) => e.key === "calendar");
  if (at < 0 || entries.some((e) => e.key === "waitlist")) return;
  entries.splice(at + 1, 0, { key: "waitlist", href: `${base}/waitlist`, label, group: entries[at]!.group, parent: "calendar" });
}

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** "1 h 40" or "25 min" until `iso` (never negative). */
export function timeLeft(t: T, iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  const h = Math.floor(min / 60);
  return h > 0 ? t("wl.left.hm", { h, m: String(min % 60).padStart(2, "0") }) : t("wl.left.m", { m: min });
}

export const PREF_KEY: Record<waitlistApi.WaitlistTimePref, MessageKey> = {
  any: "wl.pref.any",
  morning: "wl.pref.morning",
  afternoon: "wl.pref.afternoon",
  evening: "wl.pref.evening",
};

/** "Sat, Nov 8" or "Nov 8 – Nov 21", for a YYYY-MM-DD window (dates are calendar days, so they format in UTC). */
export function windowLabel(fmt: (d: Date, opts: Intl.DateTimeFormatOptions, tz?: string) => string, from: string, to: string): string {
  const d = (x: string) => new Date(`${x}T12:00:00Z`);
  if (from === to) return fmt(d(from), { weekday: "short", month: "short", day: "numeric" }, "UTC");
  return `${fmt(d(from), { month: "short", day: "numeric" }, "UTC")} – ${fmt(d(to), { month: "short", day: "numeric" }, "UTC")}`;
}

/** The billing page with Pro preselected: every "See Pro" link. */
export const seeProHref = (base: string) => `${base}/billing?plan=plus`;
