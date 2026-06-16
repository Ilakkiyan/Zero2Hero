import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProviderToggle from "@/components/ProviderToggle";
import { getProviderPref } from "@/lib/apiClient";

describe("ProviderToggle", () => {
  it("renders both options and lifts changes while persisting the preference", async () => {
    const onChange = vi.fn();
    render(<ProviderToggle value="local" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /cloud/i }));
    expect(onChange).toHaveBeenCalledWith("cloud");
    expect(getProviderPref()).toBe("cloud");

    await userEvent.click(screen.getByRole("button", { name: /local/i }));
    expect(onChange).toHaveBeenCalledWith("local");
    expect(getProviderPref()).toBe("local");
  });
});
