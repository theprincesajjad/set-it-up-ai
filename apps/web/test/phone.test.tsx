import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PhoneField } from "@/components/ui/PhoneField";
import { digitsAfterEdit, formatE164, formatNanp, normalizeDigits, toE164, validateNanp } from "@/lib/phone";

describe("phone formatting (system.md PhoneField)", () => {
  it("formats progressively", () => {
    expect(formatNanp("4")).toBe("(4");
    expect(formatNanp("416")).toBe("(416");
    expect(formatNanp("4165")).toBe("(416) 5");
    expect(formatNanp("416555")).toBe("(416) 555");
    expect(formatNanp("4165550")).toBe("(416) 555-0");
    expect(formatNanp("4165550123")).toBe("(416) 555-0123");
    expect(formatNanp("")).toBe("");
  });

  it("normalises pasted / autofilled numbers", () => {
    expect(normalizeDigits("+1 416-555-0123")).toBe("4165550123");
    expect(normalizeDigits("416.555.0123")).toBe("4165550123");
    expect(normalizeDigits("14165550123")).toBe("4165550123");
    expect(normalizeDigits("(416) 555-01234567")).toBe("4165550123");
  });

  it("validates NANP and emits E.164", () => {
    expect(validateNanp("416555")).toBe("incomplete");
    expect(validateNanp("0165550123")).toBe("invalid");
    expect(validateNanp("4161550123")).toBe("invalid");
    expect(validateNanp("4165550123")).toBe("ok");
    expect(toE164("(416) 555-0123")).toBe("+14165550123");
    expect(toE164("416555")).toBeNull();
    expect(formatE164("+14165550123")).toBe("(416) 555-0123");
  });

  it("backspace over a formatting character deletes the previous digit", () => {
    // caret after "-" in "(416) 555-0123", backspace removes "-" → the 5 before it goes
    expect(digitsAfterEdit("(416) 555-0123", "(416) 5550123", 9)).toBe("416550123");
    // ") " removed with the caret right after "(416" → the 6 goes
    expect(digitsAfterEdit("(416) 5", "(416 5", 4)).toBe("415");
    // a normal digit deletion at the end
    expect(digitsAfterEdit("(416) 555-0", "(416) 555-")).toBe("416555");
  });
});

function Harness({ onE164 }: { onE164: (v: string | null) => void }) {
  const [d, setD] = useState("");
  return <PhoneField value={d} onChangeDigits={setD} onChangeE164={onE164} />;
}

describe("<PhoneField>", () => {
  it("formats as you type and emits E.164 when complete", async () => {
    const onE164 = vi.fn();
    render(<Harness onE164={onE164} />);
    const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
    expect(input.type).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("tel-national");
    await userEvent.type(input, "4165550123");
    expect(input.value).toBe("(416) 555-0123");
    expect(onE164).toHaveBeenLastCalledWith("+14165550123");
  });

  it("accepts paste with country code", () => {
    const onE164 = vi.fn();
    render(<Harness onE164={onE164} />);
    const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "+1 416-555-0199" } });
    expect(input.value).toBe("(416) 555-0199");
    expect(onE164).toHaveBeenLastCalledWith("+14165550199");
  });

  it("shows the incomplete error on blur, linked via aria-describedby", () => {
    render(<Harness onE164={() => undefined} />);
    const input = screen.getByLabelText("Mobile number");
    fireEvent.change(input, { target: { value: "416" } });
    fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const id = input.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe("Enter a 10-digit mobile number.");
  });
});
