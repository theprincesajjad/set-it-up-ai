import { act } from "@testing-library/react";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/components/ui/Checkbox";
import { OtpField } from "@/components/ui/OtpField";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Server-render `ui`, let the user type into the raw DOM (no handlers yet), then hydrate: the real slow-phone sequence. */
async function hydrateAfterTyping(ui: React.ReactElement, type: (container: HTMLElement) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(ui);
  type(container);
  await act(async () => {
    hydrateRoot(container, ui);
  });
  return container;
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value; // no React listeners exist yet, so nothing sees this
}

function Phone({ onSubmit }: { onSubmit: (e164: string | null, digits: string) => void }) {
  const [digits, setDigits] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(e164, digits); }}>
      <PhoneField value={digits} onChangeDigits={setDigits} onChangeE164={setE164} />
      <button type="submit">go</button>
    </form>
  );
}

describe("typing before hydration is adopted", () => {
  it("PhoneField: formats the typed digits and gives state the number", async () => {
    let got: [string | null, string] | null = null;
    const c = await hydrateAfterTyping(<Phone onSubmit={(a, b) => (got = [a, b])} />, (el) => typeInto(el.querySelector("input")!, "6475550123"));
    expect(c.querySelector("input")!.value).toBe("(647) 555-0123");
    await act(async () => c.querySelector("form")!.requestSubmit());
    expect(got).toEqual(["+16475550123", "6475550123"]);
  });

  it("PhoneField: a pasted formatted number is normalised too", async () => {
    const c = await hydrateAfterTyping(<Phone onSubmit={() => undefined} />, (el) => typeInto(el.querySelector("input")!, "+1 647-555-0123"));
    expect(c.querySelector("input")!.value).toBe("(647) 555-0123");
  });

  it("PhoneField (uncontrolled): keeps and formats the typed digits", async () => {
    let digits = "";
    const c = await hydrateAfterTyping(<PhoneField onChangeDigits={(d) => (digits = d)} />, (el) => typeInto(el.querySelector("input")!, "6475550123"));
    expect(c.querySelector("input")!.value).toBe("(647) 555-0123");
    expect(digits).toBe("6475550123");
  });

  it("OtpField: adopts the code and reports completion", async () => {
    let completed = "";
    function Otp() {
      const [code, setCode] = useState("");
      return <OtpField value={code} onChange={setCode} onComplete={(c) => (completed = c)} autoFocus={false} />;
    }
    const c = await hydrateAfterTyping(<Otp />, (el) => typeInto(el.querySelector("input")!, "123456"));
    expect(c.querySelector("input")!.value).toBe("123456");
    expect(completed).toBe("123456");
  });

  it("TextField and textarea: the parent's state receives the typed text", async () => {
    function Form() {
      const [name, setName] = useState("");
      const [note, setNote] = useState("");
      return (
        <form>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField type="textarea" label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <output data-testid="state">{`${name}|${note}`}</output>
        </form>
      );
    }
    const c = await hydrateAfterTyping(<Form />, (el) => {
      typeInto(el.querySelector("input")!, "Alex");
      typeInto(el.querySelector("textarea")!, "Hello");
    });
    expect(c.querySelector("output")!.textContent).toBe("Alex|Hello");
  });

  it("Select and Checkbox: a choice made before hydration survives", async () => {
    function Form() {
      const [lang, setLang] = useState("en");
      const [ok, setOk] = useState(false);
      return (
        <form>
          <Select label="Language" value={lang} onChange={(e) => setLang(e.target.value)} options={[{ value: "en", label: "English" }, { value: "pa", label: "Punjabi" }]} />
          <Checkbox label="Texts" checked={ok} onChange={setOk} />
          <output>{`${lang}|${ok}`}</output>
        </form>
      );
    }
    const c = await hydrateAfterTyping(<Form />, (el) => {
      el.querySelector("select")!.value = "pa";
      el.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked = true;
    });
    expect(c.querySelector("output")!.textContent).toBe("pa|true");
  });

  it("does nothing when nothing was typed", async () => {
    let calls = 0;
    const c = await hydrateAfterTyping(<PhoneField onChangeDigits={() => calls++} />, () => undefined);
    expect(c.querySelector("input")!.value).toBe("");
    expect(calls).toBe(0);
  });
});
