"use client";
import { Panel } from "@/components/dashboard/kit";
import { CheckCircle2, Download, FileUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { FIELD_LABELS, IMPORT_FIELDS, buildImportCsv, guessMapping, parseCsv, previewRows, skippedCsv, type ImportField, type Mapping } from "@/lib/dashboard/csv";

type Step = "upload" | "map" | "preview" | "done";

export interface ImportWizardProps {
  importCsv: (body: { csv: string; dryRun: boolean; sourceName?: string }) => Promise<merchantApi.ImportCustomersResult>;
  onFinished?: () => void;
}

/** CSV import (merchant-dashboard.md §3): upload → map columns (phone required) → preview + CASL question → import → results. */
export function ImportWizard({ importCsv, onFinished }: ImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [consent, setConsent] = useState<"no" | "yes">("no");
  const [sourceName, setSourceName] = useState("");
  const [check, setCheck] = useState<merchantApi.ImportCustomersResult | null>(null);
  const [result, setResult] = useState<merchantApi.ImportCustomersResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = rows[0] ?? [];
  const preview = useMemo(() => previewRows(rows, mapping, { consentAnswer: consent, limit: 5 }), [rows, mapping, consent]);
  const steps: Step[] = ["upload", "map", "preview", "done"];

  function load(text: string, name: string) {
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("That file has no customer rows. The first row should be column names.");
      return;
    }
    setRows(parsed);
    setFileName(name);
    setMapping(guessMapping(parsed[0]!));
    setError(null);
    setStep("map");
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importCsv({ csv: buildImportCsv(rows, mapping, consent), dryRun, sourceName: sourceName.trim() || undefined });
      if (dryRun) setCheck(r);
      else {
        setResult(r);
        setStep("done");
        onFinished?.();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar value={steps.indexOf(step) + 1} max={4} label={`Step ${steps.indexOf(step) + 1} of 4`} valueText={{ upload: "Upload", map: "Match columns", preview: "Check and import", done: "Done" }[step]} />
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {step === "upload" ? (
        <Panel>
          <h2 className="text-body-strong text-fg">Upload a CSV file</h2>
          <p className="mt-1 text-body text-fg-muted">Export your members from your old loyalty app or spreadsheet. We need at least a phone number for each customer. Re-importing the same file never doubles anyone&apos;s balance.</p>
          <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong p-6 text-center hover:bg-bg-subtle focus-within:focus-ring">
            <FileUp aria-hidden className="size-8 text-fg" />
            <span className="text-body-strong text-fg">Choose a CSV file</span>
            <span className="text-meta text-fg-muted">Up to 20,000 rows</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="CSV file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(await f.text(), f.name);
              }}
            />
          </label>
          <details className="mt-4">
            <summary className="cursor-pointer text-label text-fg">Or paste CSV text</summary>
            <PasteBox onLoad={(t) => load(t, "Pasted data")} />
          </details>
        </Panel>
      ) : null}

      {step === "map" ? (
        <Panel>
          <h2 className="text-body-strong text-fg">Match your columns</h2>
          <p className="mt-1 text-body text-fg-muted">
            {fileName}: {formatNumber(rows.length - 1)} rows. We guessed the matches; check them.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <Select
                key={f}
                label={`${FIELD_LABELS[f]}${f === "phone" ? " (required)" : ""}`}
                value={mapping[f] != null ? String(mapping[f]) : ""}
                onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === "" ? null : Number(e.target.value) }))}
                placeholder="Don't import"
                options={headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))}
              />
            ))}
          </div>
          <TextField className="mt-4" label="Moving from" optionalLabel hint="Shown in each customer's history, e.g. 'Imported from SoPoints'." value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              onClick={() => {
                if (mapping.phone == null) return setError("Pick the column with phone numbers.");
                setError(null);
                setCheck(null);
                setStep("preview");
              }}
            >
              Next
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === "preview" ? (
        <>
          <Panel>
            <h2 className="text-body-strong text-fg">Preview</h2>
            <p className="mt-1 text-meta text-fg-muted">
              First {preview.rows.length} of {formatNumber(preview.total)} rows. {preview.invalid ? `${formatNumber(preview.invalid)} rows have no valid mobile number and will be skipped.` : "Every row has a valid mobile number."}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-meta">
                <caption className="sr-only">Import preview</caption>
                <thead className="text-label text-fg-muted">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-start">Row</th>
                    <th scope="col" className="px-2 py-2 text-start">Name</th>
                    <th scope="col" className="px-2 py-2 text-start">Phone</th>
                    <th scope="col" className="px-2 py-2 text-end">Points</th>
                    <th scope="col" className="px-2 py-2 text-start">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className={cn("border-t border-line", r.problem && "bg-danger-subtle text-on-danger-subtle")}>
                      <td className="px-2 py-2 tabular-nums">{r.row}</td>
                      <td className="px-2 py-2">{r.name || "–"}</td>
                      <td className="px-2 py-2 tabular-nums">{r.problem ? `${r.phone || "–"} · ${r.problem}` : r.phone}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{r.points}</td>
                      <td className="px-2 py-2">{r.consent ? <Badge tone="success">Opted in</Badge> : <Badge>No consent</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <fieldset>
              <legend className="text-body-strong text-fg">Did these customers agree to get marketing messages from you?</legend>
              <div className="mt-3 flex flex-col gap-2">
                {(
                  [
                    ["no", "No, or I'm not sure", "They're imported without marketing consent. They can opt in at the counter or in the app."],
                    ["yes", "Yes, and I have records of it", `Only rows with a "yes" and a past consent date are opted in (${formatNumber(preview.withConsent)} rows). Keep your records: CASL may ask for them.`],
                  ] as const
                ).map(([v, label, cap]) => (
                  <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-input border p-3", consent === v ? "border-brand bg-bg-subtle" : "border-line")}>
                    <input type="radio" name="consent" value={v} checked={consent === v} onChange={() => setConsent(v)} className="mt-1 size-5 accent-[var(--color-brand)]" />
                    <span>
                      <span className="block text-body-strong text-fg">{label}</span>
                      <span className="block text-meta text-fg-muted">{cap}</span>
                    </span>
                  </label>
                ))}
              </div>
              {consent === "yes" && (mapping.consent == null || mapping.consent_date == null) ? (
                <Banner tone="warning" className="mt-3">
                  Match both &quot;Agreed to marketing&quot; and &quot;Date they agreed&quot; columns, or nobody will be opted in.
                </Banner>
              ) : null}
            </fieldset>
          </Panel>

          {check ? (
            <Banner tone={check.errors.length ? "warning" : "success"} title="Check complete">
              {formatNumber(check.membersCreated)} new and {formatNumber(check.membersExisting)} existing customers, {formatNumber(check.pointsImported)} points, {formatNumber(check.errors.length)} rows skipped, {formatNumber(check.consentRecorded)} opted in.
              {check.warnings.length ? ` ${formatNumber(check.warnings.length)} warnings (e.g. row ${check.warnings[0]!.row}: ${check.warnings[0]!.message}).` : ""}
            </Banner>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button variant="secondary" loading={busy && !check} onClick={() => run(true)}>
              Check file
            </Button>
            <Button loading={busy && !!check} onClick={() => run(false)}>
              {`Import ${formatNumber(preview.total - preview.invalid)} customers`}
            </Button>
          </div>
        </>
      ) : null}

      {step === "done" && result ? (
        <Panel>
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden className="size-8 shrink-0 text-positive" />
            <div>
              <h2 className="text-body-strong text-fg">
                {formatNumber(result.membersCreated + result.membersExisting - result.duplicates)} imported, {formatNumber(result.errors.length)} skipped
              </h2>
              <p className="mt-1 text-body text-fg-muted">
                {formatNumber(result.pointsImported)} points added. {formatNumber(result.consentRecorded)} customers opted in to messages.{result.duplicates ? ` ${formatNumber(result.duplicates)} were already imported, so their balances weren't added again.` : ""}
              </p>
            </div>
          </div>
          {result.errors.length ? (
            <>
              <ul className="mt-4 max-h-48 overflow-auto text-meta text-fg">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                iconStart={Download}
                className="mt-3"
                onClick={() => {
                  const blob = new Blob([skippedCsv(rows, result.errors)], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "skipped-rows.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Download skipped rows
              </Button>
            </>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function PasteBox({ onLoad }: { onLoad: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2">
      <TextField type="textarea" label="CSV text" hideLabel value={t} onChange={(e) => setT(e.target.value)} placeholder={"phone,name,points\n4165550123,Pat Q,40"} />
      <Button variant="secondary" className="self-start" onClick={() => onLoad(t)} disabled={!t.trim()}>
        Use this text
      </Button>
    </div>
  );
}

export type { ImportField };
