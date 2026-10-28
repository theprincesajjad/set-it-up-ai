import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SaveBar, SidePanel } from "@/components/dashboard/kit";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function Form() {
  const base = "Corner Bean";
  const [name, setName] = useState(base);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <TextField label="Shop name" hint="Shown on receipts" error={name === "" ? "Enter a name" : null} value={name} onChange={(e) => setName(e.target.value)} />
      <SaveBar dirty={name !== base} onDiscard={() => setName(base)}>
        <button type="button" disabled={busy} onClick={() => setBusy(true)}>
          Save changes
        </button>
      </SaveBar>
    </div>
  );
}

describe("SaveBar", () => {
  it("appears on change, Discard restores, Save disables while pending", async () => {
    const u = userEvent.setup();
    render(<Form />);
    expect(screen.queryByTestId("save-bar")).toBeNull();
    await u.type(screen.getByLabelText("Shop name"), "x");
    expect(screen.getByTestId("save-bar")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(screen.getByRole("button", { name: "Discard" }));
    expect((screen.getByLabelText("Shop name") as HTMLInputElement).value).toBe("Corner Bean");
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });
});

describe("TextField", () => {
  it("wires hint and error through aria-describedby", () => {
    const { rerender } = render(<TextField label="Name" hint="A hint" value="" onChange={() => undefined} />);
    const el = screen.getByLabelText("Name");
    expect(document.getElementById(el.getAttribute("aria-describedby")!)?.textContent).toContain("A hint");
    rerender(<TextField label="Name" hint="A hint" error="Required" value="" onChange={() => undefined} />);
    expect(el.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(el.getAttribute("aria-describedby")!)?.textContent).toContain("Required");
  });
});

describe("PhoneField", () => {
  it("keeps the number input left to right inside an RTL page", () => {
    render(
      <div dir="rtl">
        <PhoneField label="Phone" value="" onChangeDigits={() => undefined} />
      </div>,
    );
    expect(screen.getByLabelText("Phone").getAttribute("dir")).toBe("ltr");
  });
});

describe("Modal and SidePanel", () => {
  it("Modal is a dialog that closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Delete it?" />);
    expect(screen.getByRole("dialog", { name: "Delete it?" })).toBeTruthy();
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
  it("SidePanel is a labelled dialog and mounts only while open", () => {
    const { rerender } = render(<SidePanel open onClose={() => undefined} title="Sam" label="Customer" >body</SidePanel>);
    expect(screen.getByRole("dialog", { name: "Customer" })).toBeTruthy();
    rerender(<SidePanel open={false} onClose={() => undefined} title="Sam" label="Customer">body</SidePanel>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Toast", () => {
  function Fire() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast("Saved")}>one</button>
        <button onClick={() => toast({ message: "Failed", tone: "error" })}>two</button>
      </>
    );
  }
  it("shows one toast at a time inside a polite region and the newest replaces the old", async () => {
    const u = userEvent.setup();
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    await u.click(screen.getByText("one"));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(document.querySelector('[data-slot="toast-viewport"]')).toBeTruthy();
    await act(async () => {
      await u.click(screen.getByText("two"));
    });
    expect((await screen.findAllByText("Failed")).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert").textContent).toContain("Failed"); // errors announce assertively
    await waitFor(() => expect(screen.queryByText("Saved")).toBeNull());
  });
});
