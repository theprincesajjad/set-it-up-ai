/**
 * Pure logic for the repair tickets board: which column a ticket sits in, the order inside a column, and the words on a
 * card. Kept free of React so it is unit-tested (test/tickets-board.test.ts).
 */
import type { serviceApi } from "@ll/shared";
import { formatMoney } from "@/lib/format";

type Ticket = serviceApi.TicketDto;
type Status = serviceApi.TicketStatus;
const TZ = "America/Toronto";

export interface BoardColumn {
  key: "dropped" | "waiting" | "shop" | "ready";
  title: string;
  statuses: Status[];
}

/** Same stages as before so staff keep their habits; the second column is the one that waits on the customer. */
export const BOARD_COLUMNS: BoardColumn[] = [
  { key: "dropped", title: "Dropped off", statuses: ["intake", "diagnosing"] },
  { key: "waiting", title: "Waiting on customer", statuses: ["quote_sent", "declined"] },
  { key: "shop", title: "In the shop", statuses: ["approved", "in_progress", "waiting_parts"] },
  { key: "ready", title: "Ready for pickup", statuses: ["ready"] },
];

const DUE_RANK = { overdue: 0, today: 1 } as const;

/** Overdue first, then due today, then the rest; declined last in its column; newest activity first within a group. */
export function sortColumn(items: Ticket[]): Ticket[] {
  const rank = (t: Ticket) => (t.status === "declined" ? 3 : t.dueState ? DUE_RANK[t.dueState] : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
}

export function deviceTitle(t: Pick<Ticket, "itemDetails" | "itemKind">): string {
  const d = t.itemDetails;
  const name = [d.make, d.model].filter(Boolean).join(" ") || d.description || "";
  if (name) return name;
  if (d.items) {
    try {
      const list = JSON.parse(d.items) as { description?: string }[];
      if (Array.isArray(list) && list.length) return list.length === 1 ? (list[0]!.description ?? "Item") : `${list.length} items`;
    } catch {
      /* not JSON */
    }
  }
  return t.itemKind === "vehicle" ? "Vehicle" : t.itemKind === "garment" ? "Garment" : t.itemKind === "device" ? "Device" : "Item";
}

const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(/\./g, "").replace(/\s?([ap])\s?m/i, (_, x: string) => ` ${x.toLowerCase()}m`).replace(":00", "");
const weekday = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short" }).format(d);

/** "5 min", "2 h", "3 days": age in the coarsest sensible unit. */
export function ageText(from: string | Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(from).getTime());
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(ms / 86_400_000);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** "5 min ago", "2 days ago", and just "just now" (never "just now ago"). */
export function agoText(from: string | Date, now: Date): string {
  const t = ageText(from, now);
  return t === "just now" ? t : `${t} ago`;
}

/** "due Fri 5 pm", "due today 5 pm", "overdue 1 day". */
export function dueText(t: Pick<Ticket, "promisedAt" | "dueState">, now: Date): string | null {
  if (!t.promisedAt) return null;
  const p = new Date(t.promisedAt);
  if (t.dueState === "overdue") return `overdue ${ageText(p, now)}`;
  if (day(p) === day(now)) return `due today ${clock(p)}`;
  if (day(p) === day(new Date(now.getTime() + 86_400_000))) return `due tomorrow ${clock(p)}`;
  return `due ${weekday(p)} ${clock(p)}`;
}

export type Tone = "accent" | "info" | "positive" | "negative" | "neutral";
export interface CardModel {
  id: string;
  number: number;
  statusLabel: string;
  tone: Tone;
  title: string;
  issue: string;
  who: string;
  overdue: boolean;
  initials: string | null;
  note: { text: string; tone: Tone } | null;
}

/** Everything a board card shows, from the ticket alone. */
export function cardModel(t: Ticket, now: Date): CardModel {
  const q = t.quote;
  const inv = t.invoice;
  const name = t.customer?.name?.trim() || "Customer";
  const due = dueText(t, now);
  const overdue = t.dueState === "overdue";
  let statusLabel = "";
  let tone: Tone = "info";
  let note: CardModel["note"] = null;
  switch (t.status) {
    case "intake":
      statusLabel = "Needs diagnosis";
      tone = "accent";
      if (t.photos.length) note = { text: `Intake photos: ${t.photos.length}`, tone: "neutral" };
      break;
    case "diagnosing":
      statusLabel = "Diagnosing";
      note = t.photos.length ? { text: `Intake photos: ${t.photos.length}`, tone: "neutral" } : null;
      break;
    case "quote_sent": {
      const sent = q?.sentAt ?? t.updatedAt;
      statusLabel = `Quote sent ${agoText(sent, now)}`;
      if (q) {
        const expires = q.expiresAt ? new Date(q.expiresAt).getTime() - now.getTime() : null;
        if (q.firstViewedAt) note = { text: `Quote ${formatMoney(q.totalCents)}, opened, not approved`, tone: "info" };
        else if (expires !== null && expires <= 36 * 3_600_000 && expires > 0) note = { text: `Quote ${formatMoney(q.totalCents)}, expires ${day(new Date(q.expiresAt!)) === day(now) ? "today" : "tomorrow"}`, tone: "negative" };
        else note = { text: `Quote ${formatMoney(q.totalCents)}, not opened yet`, tone: "neutral" };
      }
      break;
    }
    case "declined":
      statusLabel = "Declined";
      tone = "neutral";
      note = { text: "Quote declined: return the device", tone: "neutral" };
      break;
    case "approved":
      statusLabel = t.depositPaidCents ? "Approved, deposit paid" : "Approved";
      tone = "accent";
      if (t.depositPaidCents) note = { text: `Deposit ${formatMoney(t.depositPaidCents)} paid`, tone: "neutral" };
      break;
    case "in_progress":
      statusLabel = "Work started";
      break;
    case "waiting_parts":
      statusLabel = "Waiting for parts";
      break;
    case "ready": {
      const days = t.readyAt ? Math.floor((now.getTime() - new Date(t.readyAt).getTime()) / 86_400_000) : 0;
      statusLabel = days < 1 ? "Ready today" : `Ready ${days} ${days === 1 ? "day" : "days"}`;
      tone = "positive";
      if (inv?.status === "open") note = { text: `Invoice ${formatMoney(inv.amountDueCents)} open`, tone: "info" };
      else if (inv?.status === "paid") note = { text: `Paid ${formatMoney(inv.totalCents)}, tap to hand over`, tone: "neutral" };
      if (t.lienEligible) note = { text: "Ready 60+ days, uncollected", tone: "negative" };
      break;
    }
    default:
      statusLabel = t.status.replace(/_/g, " ");
      tone = "neutral";
  }
  if (overdue) note = { text: `Overdue: text ${name.split(/\s+/)[0]} a new time`, tone: "negative" };
  return {
    id: t.id,
    number: t.number,
    statusLabel,
    tone,
    title: deviceTitle(t),
    issue: t.issue,
    who: [name, due].filter(Boolean).join(" · "),
    overdue,
    initials: t.assignedStaff?.initials ?? null,
    note,
  };
}
