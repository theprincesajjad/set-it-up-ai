import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RedeemCode } from "@/components/ui/RedeemCode";

describe("<RedeemCode>", () => {
  it("shows the caption over the code and the reward in the confirmation, never the caption as the reward", () => {
    render(<RedeemCode code="Q25UGJ" rewardName="Free drink" label="Your code" status="used" />);
    expect(screen.getByText("Free drink. Enjoy.")).toBeTruthy();
    expect(screen.queryByText(/Your code\. Enjoy/)).toBeNull();
  });

  it("names the shop's own word on the cancel link", () => {
    render(<RedeemCode code="Q25UGJ" rewardName="Free drink" label="Your code" unit="stamps" onCancel={() => undefined} />);
    expect(screen.getByRole("button", { name: "Cancel and keep my stamps" })).toBeTruthy();
    expect(screen.getByText("Your code")).toBeTruthy();
  });
});
