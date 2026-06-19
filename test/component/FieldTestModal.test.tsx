import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldTestModal from "@/components/FieldTestModal";
import { validPlan } from "@/test/fixtures/plan";

afterEach(() => vi.unstubAllGlobals());

const jsonOk = (body: unknown) => ({ ok: true, json: async () => body });

const design = {
  method: "Door-to-door flyer + sign-up sheet",
  channel: "in-person",
  scale: "Knock on 10 doors this weekend",
  why: "Cheapest real read on demand before building anything.",
  steps: ["Print 10 flyers", "Knock on 10 doors", "Log sign-ups"],
  artifact: "Hi — testing a local dog-walking service. Interested? Sign here.",
  proveIf: "3+ of 10 sign up.",
  killIf: "Nobody is interested.",
};

function renderModal(onApply = vi.fn()) {
  render(
    <FieldTestModal
      brief={validPlan.brief}
      assumption={validPlan.assumptions[0]}
      onApply={onApply}
      onClose={() => {}}
    />,
  );
  return onApply;
}

describe("FieldTestModal", () => {
  it("designs an offline test, captures a real result, and applies it as evidence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonOk({ design }))
      .mockResolvedValueOnce(
        jsonOk({
          result: { stance: "supports", summary: "6 of 10 interested, 2 prepaid.", suggestedStatus: "passed" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onApply = renderModal();

    // The designed (offline) test kit renders — not a software default.
    expect(await screen.findByText(/door-to-door flyer/i)).toBeInTheDocument();
    expect(screen.getByText(/In person/i)).toBeInTheDocument();
    expect(screen.getByText(/Hi — testing a local dog-walking service/)).toBeInTheDocument();

    // Log a real-world result.
    await userEvent.type(
      screen.getByPlaceholderText(/knocked on 10 doors/i),
      "6 of 10 interested, 2 prepaid",
    );
    await userEvent.click(screen.getByRole("button", { name: /log result/i }));

    // The model's read appears and applies as primary evidence.
    expect(await screen.findByText(/6 of 10 interested, 2 prepaid\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /apply as evidence/i }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0]).toMatchObject({ stance: "supports", suggestedStatus: "passed" });
  });

  it("surfaces a design error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "model down" }) }),
    );
    renderModal();
    expect(await screen.findByText("model down")).toBeInTheDocument();
  });
});
