/**
 * CSV import wizard logic (merchant-dashboard.md §3 "Import flow"): parse, map columns,
 * preview with per-row checks, and build the canonical CSV the API expects
 * (POST /customers/import: phone, name, email, points, visits, birthday, consent, consent_date).
 */
import { normalizeDigits, validateNanp, formatNanp } from "@/lib/phone";

export const IMPORT_FIELDS = ["phone", "name", "email", "points", "visits", "birthday", "consent", "consent_date"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number | null>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  phone: "Mobile number",
  name: "Name",
  email: "Email",
  points: "Points balance",
  visits: "Visits",
  birthday: "Birthday",
  consent: "Agreed to marketing",
  consent_date: "Date they agreed",
};

/** RFC 4180-ish: quoted fields, escaped quotes, CRLF/LF, trailing newline, BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES: Record<ImportField, RegExp> = {
  phone: /^(phone|mobile|cell|phone ?number|mobile ?number|tel|telephone)$/i,
  name: /^(name|full ?name|customer|customer ?name|first ?name)$/i,
  email: /^(e-?mail|email ?address)$/i,
  points: /^(points|balance|point ?balance|stamps|pts)$/i,
  visits: /^(visits|visit ?count|number of visits)$/i,
  birthday: /^(birthday|birth ?date|dob|date of birth)$/i,
  consent: /^(consent|marketing|opt[- ]?in|marketing ?consent|accepts? marketing)$/i,
  consent_date: /^(consent[_ ]?date|opt[- ]?in[_ ]?date|consented ?at|consent ?at)$/i,
};

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((h) => ALIASES[f].test(h.trim()));
    m[f] = i >= 0 ? i : null;
  }
  return m;
}

export interface PreviewRow {
  row: number;
  phone: string;
  name: string;
  points: number;
  consent: boolean;
  problem: string | null;
}

const TRUTHY = /^(y|yes|true|1|x|oui|opted in|subscribed)$/i;

export function isConsentTruthy(v: string | undefined): boolean {
  return TRUTHY.test((v ?? "").trim());
}

export function validDate(v: string | undefined, now = new Date()): boolean {
  if (!v) return false;
  const d = new Date(v.trim());
  return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime();
}

/** Rows (after the header) checked the same way the API will; first `limit` returned. */
export function previewRows(rows: string[][], mapping: Mapping, opts: { consentAnswer: "no" | "yes"; limit?: number; now?: Date } = { consentAnswer: "no" }): { rows: PreviewRow[]; total: number; invalid: number; withConsent: number } {
  const body = rows.slice(1);
  const out: PreviewRow[] = [];
  let invalid = 0;
  let withConsent = 0;
  body.forEach((r, i) => {
    const get = (f: ImportField) => (mapping[f] != null ? (r[mapping[f]!] ?? "").trim() : "");
    const digits = normalizeDigits(get("phone"));
    const v = validateNanp(digits);
    const pts = Number.parseInt(get("points").replace(/[^\d-]/g, ""), 10);
    const consent = opts.consentAnswer === "yes" && isConsentTruthy(get("consent")) && validDate(get("consent_date"), opts.now);
    const problem = !get("phone") ? "No phone number" : v !== "ok" ? "Not a valid mobile number" : null;
    if (problem) invalid++;
    if (consent && !problem) withConsent++;
    if (out.length < (opts.limit ?? 5)) out.push({ row: i + 1, phone: digits.length === 10 ? formatNanp(digits) : get("phone"), name: get("name"), points: Number.isFinite(pts) ? Math.max(0, pts) : 0, consent, problem });
  });
  return { rows: out, total: body.length, invalid, withConsent };
}

function esc(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Canonical CSV for the API. When the merchant answers "No, or I'm not sure",
 * consent columns are dropped entirely so nobody is imported with marketing consent (CASL).
 */
export function buildImportCsv(rows: string[][], mapping: Mapping, consentAnswer: "no" | "yes"): string {
  const fields = IMPORT_FIELDS.filter((f) => mapping[f] != null && (consentAnswer === "yes" || (f !== "consent" && f !== "consent_date")));
  const lines = [fields.join(",")];
  for (const r of rows.slice(1)) lines.push(fields.map((f) => esc((r[mapping[f]!] ?? "").trim())).join(","));
  return `${lines.join("\n")}\n`;
}

/** Skipped rows as a downloadable CSV ("Download skipped rows"). */
export function skippedCsv(rows: string[][], errors: { row: number; message: string }[]): string {
  const header = [...(rows[0] ?? []), "error"];
  const lines = [header.map(esc).join(",")];
  for (const e of errors) lines.push([...(rows[e.row] ?? []), e.message].map((c) => esc(String(c))).join(","));
  return `${lines.join("\n")}\n`;
}
