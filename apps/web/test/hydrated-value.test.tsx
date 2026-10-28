import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Select } from "@/components/ui/Select";

describe("useHydratedValue only adopts during hydration", () => {
  it("a select that mounts on the client before its options load keeps its value (the pet picker's preselected dog)", async () => {
    let setOptions: (o: { value: string; label: string }[]) => void = () => {};
    let seen = "";
    function Picker() {
      const [value, setValue] = useState("dog-1");
      const [options, set] = useState<{ value: string; label: string }[]>([]);
      setOptions = set;
      seen = value;
      return <Select label="Dog" value={value} onChange={(e) => setValue(e.target.value)} options={[{ value: "", label: "No dog" }, ...options]} />;
    }
    render(<Picker />);
    await act(async () => setOptions([{ value: "dog-1", label: "Biscuit" }]));
    expect(seen).toBe("dog-1");
    expect((screen.getByLabelText("Dog") as HTMLSelectElement).value).toBe("dog-1");
  });
});
