import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportWizard } from "@/components/dashboard/ImportWizard";
import { buildImportCsv, guessMapping, parseCsv, previewRows, skippedCsv } from "@/lib/dashboard/csv";

const CSV = 'Mobile,Full Name,Balance,Opt-in,Consent Date\r\n"(416) 555-0123","Pat, Q",40,yes,2025-03-01\n4165550199,Sam,12,no,\nnot-a-phone,Bad Row,5,yes,2025-01-01\n\n';

describe("CSV import parsing", () => {
  it("parses quotes, commas inside quotes, CRLF and blank lines", () => {
    const rows = parseCsv(`﻿${CSV}`);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual(["(416) 555-0123", "Pat, Q", "40", "yes", "2025-03-01"]);
    expect(parseCsv('a,b\n"he said ""hi""",2')[1]).toEqual(['he said "hi"', "2"]);
  });

  it("guesses the column mapping from common headers", () => {
    const m = guessMapping(parseCsv(CSV)[0]!);
    expect(m).toMatchObject({ phone: 0, name: 1, points: 2, consent: 3, consent_date: 4, email: null });
  });

  it("previews rows with the same checks the API applies", () => {
    const rows = parseCsv(CSV);
    const m = guessMapping(rows[0]!);
    const no = previewRows(rows, m, { consentAnswer: "no" });
    expect(no.total).toBe(3);
    expect(no.invalid).toBe(1);
    expect(no.withConsent).toBe(0); // "No, or I'm not sure" → nobody opted in
    expect(no.rows[0]).toMatchObject({ phone: "(416) 555-0123", name: "Pat, Q", points: 40, problem: null });
    expect(no.rows[2]!.problem).toBe("Not a valid mobile number");
    const yes = previewRows(rows, m, { consentAnswer: "yes", now: new Date("2026-01-01") });
    expect(yes.withConsent).toBe(1); // needs yes + a past date; invalid rows never count
  });

  it("builds the canonical CSV and drops consent columns unless the merchant has records (CASL)", () => {
    const rows = parseCsv(CSV);
    const m = guessMapping(rows[0]!);
    const no = buildImportCsv(rows, m, "no");
    expect(no.split("\n")[0]).toBe("phone,name,points");
    expect(no).toContain('(416) 555-0123,"Pat, Q",40');
    expect(buildImportCsv(rows, m, "yes").split("\n")[0]).toBe("phone,name,points,consent,consent_date");
    expect(skippedCsv(rows, [{ row: 3, message: "Invalid phone" }])).toContain("not-a-phone,Bad Row,5,yes,2025-01-01,Invalid phone");
  });
});

describe("<ImportWizard>", () => {
  it("uploads, maps, previews, checks and imports, then shows the results", async () => {
    const importCsv = vi.fn(async (b: { csv: string; dryRun: boolean }) => ({ dryRun: b.dryRun, rows: 3, membersCreated: 2, membersExisting: 0, pointsImported: 52, duplicates: 0, consentRecorded: 0, errors: [{ row: 3, message: "Invalid phone number" }], warnings: [] }));
    render(<ImportWizard importCsv={importCsv} />);
    const file = new File([CSV], "members.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => CSV });
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
    expect(await screen.findByRole("heading", { name: "Match your columns" })).toBeTruthy();
    expect((screen.getByLabelText("Mobile number (required)") as HTMLSelectElement).value).toBe("0");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Preview" })).toBeTruthy();
    expect(screen.getByText(/1 rows have no valid mobile number/)).toBeTruthy();
    expect(screen.getByText("Did these customers agree to get marketing messages from you?")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /No, or I'm not sure/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Check file" }));
    await waitFor(() => expect(importCsv).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true })));
    expect(importCsv.mock.calls[0]![0].csv.split("\n")[0]).toBe("phone,name,points");
    expect(await screen.findByText(/2 new and 0 existing customers/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Import 2 customers" }));
    expect(await screen.findByRole("heading", { name: "2 imported, 1 skipped" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download skipped rows" })).toBeTruthy();
  });

  it("requires a phone column", async () => {
    render(<ImportWizard importCsv={vi.fn()} />);
    const csv = "name,points\nPat,4\n";
    const file = new File([csv], "x.csv");
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
    await screen.findByRole("heading", { name: "Match your columns" });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Pick the column with phone numbers.")).toBeTruthy();
  });
});
