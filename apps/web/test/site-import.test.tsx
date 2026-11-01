/**
 * Wave O, team import: the "Have a website or Instagram?" step and its review card. Every value shows its source and has a keep
 * tick and (where it makes sense) an edit control; nothing leaves the card until "Use these details"; services are suggestions
 * that start unticked; the Instagram path explains itself; Urdu renders the same card.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { siteImportApi } from "@ll/shared";
import { SiteImportReview, SiteImportStep, applyBodyFor, type SiteImportAccepted } from "@/components/onboarding";
import { ApiError } from "@/lib/api/errors";
import { LocaleScope } from "@/lib/i18n";

const RESULT: siteImportApi.SiteImportResult = {
  id: "7d6f4b8e-2a51-4c1e-9d0a-3f2b1c4d5e6f",
  url: "https://priyanails.example/",
  kind: "website",
  fetchedAt: "2026-11-01T12:00:00.000Z",
  cached: false,
  pages: ["https://priyanails.example/", "https://priyanails.example/services"],
  fields: {
    name: { value: "Priya Nails", source: "og", page: "https://priyanails.example/" },
    logo: { value: "/v1/site-import/7d6f4b8e-2a51-4c1e-9d0a-3f2b1c4d5e6f/logo", source: "apple_touch_icon", contentType: "image/png", bytes: 1200 },
    website: { value: "https://priyanails.example/", source: "canonical" },
    phone: { value: "+14165550142", source: "tel_link" },
    address: null,
    hours: { value: { tue: [["10:00", "19:00"]], sat: [["09:00", "17:00"]] }, source: "jsonld" },
    instagram: { value: "priya.nails", source: "links" },
    socials: null,
    description: { value: "Gel manicures and nail art by appointment.", source: "meta" },
    brandColor: { value: "#B83A66", found: "#E07AA0", adjusted: true, source: "logo_color" },
    accentColor: null,
    services: { value: [{ name: "Gel manicure", priceCents: 5500, source: "price_list" }, { name: "Pedicure", priceCents: 6000, source: "price_list" }], source: "price_list" },
    vertical: { value: "nails", source: "keywords" },
  },
  notes: ["address_private"],
  ai: false,
};

function renderReview(onConfirm = vi.fn(), result = RESULT) {
  render(<SiteImportReview result={result} onConfirm={onConfirm} onRestart={vi.fn()} logoBase="/api/ll" />);
  return onConfirm;
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-import-row="${id}"]`)!;

describe("SiteImportReview", () => {
  it("shows every value with its source, a keep tick and an edit control", () => {
    renderReview();
    expect(screen.getByRole("heading", { name: "Here's what we found" })).toBeTruthy();
    expect(within(row("name")).getByText("Priya Nails")).toBeTruthy();
    expect(within(row("name")).getByText("From your site's sharing details")).toBeTruthy();
    expect(within(row("phone")).getByText("(416) 555-0142")).toBeTruthy();
    expect(within(row("phone")).getByText("From a call link on your site")).toBeTruthy();
    expect(within(row("brandColor")).getByText("From your logo")).toBeTruthy();
    expect(within(row("brandColor")).getByText(/Darkened a little/)).toBeTruthy();
    expect((within(row("logo")).getByRole("img", { name: "Logo found on your website" }))?.getAttribute("src")).toBe("/api/ll/v1/site-import/7d6f4b8e-2a51-4c1e-9d0a-3f2b1c4d5e6f/logo");
    expect(within(row("vertical")).getByText("Suggestion")).toBeTruthy();
    for (const id of ["name", "vertical", "logo", "brandColor", "phone", "website", "hours", "instagram", "description"]) expect((within(row(id)).getByRole("checkbox", { name: /^Use/ }) as HTMLInputElement).checked).toBe(true);
    for (const id of ["name", "phone", "website", "brandColor", "instagram", "description", "vertical"]) expect(within(row(id)).getByRole("button", { name: /^Edit/ })).toBeTruthy();
    // The street was held back on the server; the card says why.
    expect(screen.getByText(/left your street address out/)).toBeTruthy();
    expect(document.querySelector("[data-import-row=address]")).toBeNull();
    // A preview in the shop's colour (contrast-checked by the shop colour helper).
    expect((document.querySelector("[data-import-preview]"))?.getAttribute("data-shop-color")).toBe("brand");
  });

  it("nothing is handed over until confirm; edits and unticks are respected; services are opt-in suggestions", async () => {
    const user = userEvent.setup();
    const onConfirm = renderReview();
    await user.click(within(row("name")).getByRole("button", { name: /^Edit/ }));
    const input = within(row("name")).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Priya's Nail Studio");
    await user.click(within(row("description")).getByRole("checkbox", { name: /^Use/ }));
    expect(within(row("services")).getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    await user.click(within(row("services")).getByRole("checkbox", { name: /Gel manicure/ }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use these details" }));
    const a = onConfirm.mock.calls[0]![0] as SiteImportAccepted;
    expect(a).toMatchObject({ importId: RESULT.id, from: "priyanails.example", name: "Priya's Nail Studio", vertical: "nails", phone: "+14165550142", brandColor: "#B83A66", logo: true, instagram: "priya.nails", website: "https://priyanails.example/", services: [{ name: "Gel manicure", priceCents: 5500 }] });
    expect(a.description).toBeUndefined();
    expect(a.hours).toEqual({ tue: [["10:00", "19:00"]], sat: [["09:00", "17:00"]] });
    // What the shop saves after signup: the form keeps name and phone; the rest goes to the apply call.
    expect(applyBodyFor(a)).toEqual({ importId: RESULT.id, logo: true, website: "https://priyanails.example/", instagram: "priya.nails", brandColor: "#B83A66", hours: a.hours, services: [{ name: "Gel manicure", priceCents: 5500 }] });
  });

  it("an Instagram result: the handle only, with the note and an optional https logo link", async () => {
    const user = userEvent.setup();
    const ig: siteImportApi.SiteImportResult = { ...RESULT, kind: "instagram", url: "https://www.instagram.com/priya.nails/", pages: [], notes: ["instagram_handle_only"], fields: { ...Object.fromEntries(Object.keys(RESULT.fields).map((k) => [k, null])), instagram: { value: "priya.nails", source: "instagram_url" } } as siteImportApi.SiteImportResult["fields"] };
    const onConfirm = renderReview(vi.fn(), ig);
    expect(screen.getByText("We'll use your handle; add your logo below.")).toBeTruthy();
    const logo = screen.getByLabelText(/Logo link/);
    await user.type(logo, "http://insecure.example/logo.png");
    expect((screen.getByRole("button", { name: "Use these details" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(logo);
    await user.type(logo, "https://cdn.example/logo.png");
    await user.click(screen.getByRole("button", { name: "Use these details" }));
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ from: "@priya.nails", instagram: "priya.nails", logoUrl: "https://cdn.example/logo.png" });
  });

  it("renders in Urdu, right to left", () => {
    render(
      <LocaleScope locale="ur">
        <div dir="rtl">
          <SiteImportReview result={RESULT} onConfirm={vi.fn()} onRestart={vi.fn()} />
        </div>
      </LocaleScope>,
    );
    expect(screen.getByRole("heading", { name: "ہمیں یہ ملا" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "یہ تفصیل استعمال کریں" })).toBeTruthy();
  });
});

describe("SiteImportStep", () => {
  it("link → progress → review; skip calls back; an API error keeps the form with the message", async () => {
    const user = userEvent.setup();
    let resolve!: (r: siteImportApi.SiteImportResult) => void;
    const importer = vi.fn(() => new Promise<siteImportApi.SiteImportResult>((r) => (resolve = r)));
    const onSkip = vi.fn();
    const phases: string[] = [];
    render(<SiteImportStep onDone={vi.fn()} onSkip={onSkip} importer={importer} onPhase={(p) => phases.push(p)} />);
    expect(screen.getByRole("heading", { name: "Have a website or Instagram?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fill it in for me" }));
    expect(screen.getByText("Paste your website address or your Instagram handle.")).toBeTruthy();
    await user.type(screen.getByLabelText("Website or Instagram"), "priyanails.example");
    await user.click(screen.getByRole("button", { name: "Fill it in for me" }));
    expect(importer).toHaveBeenCalledWith("priyanails.example");
    expect(await screen.findByRole("heading", { name: "Reading your website" })).toBeTruthy();
    resolve(RESULT);
    expect(await screen.findByRole("heading", { name: "Here's what we found" })).toBeTruthy();
    expect(phases).toEqual(["form", "loading", "review"]);
    await user.click(screen.getByRole("button", { name: "Try another link" }));
    await user.click(screen.getByRole("button", { name: "Skip, I'll type it" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("shows the server's reason when the site can't be read", async () => {
    const user = userEvent.setup();
    const importer = vi.fn(async (): Promise<siteImportApi.SiteImportResult> => {
      throw new ApiError(422, "site_import_blocked_address", "That address points inside a private network, so we can't read it.");
    });
    render(<SiteImportStep onDone={vi.fn()} onSkip={vi.fn()} importer={importer} />);
    await user.type(screen.getByLabelText("Website or Instagram"), "http://169.254.169.254");
    await user.click(screen.getByRole("button", { name: "Fill it in for me" }));
    await waitFor(() => expect(screen.getByText(/private network/)).toBeTruthy());
  });
});
