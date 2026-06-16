import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChallengeModal from "@/components/ChallengeModal";
import { validPlan } from "@/test/fixtures/plan";
import { ndjsonResponse } from "./stream";

const assumption = validPlan.assumptions[0];

afterEach(() => vi.unstubAllGlobals());

describe("ChallengeModal", () => {
  it("opens with the adversary's argument against the assumption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "token", value: "Incumbents already do this for free." },
          { type: "done" },
        ]),
      ),
    );
    render(<ChallengeModal assumption={assumption} onConcede={() => {}} onClose={() => {}} />);

    expect(screen.getByText(new RegExp(`Challenging: ${assumption.claim}`))).toBeInTheDocument();
    expect(await screen.findByText(/Incumbents already do this for free/)).toBeInTheDocument();
  });

  it("lets the founder defend and streams a rebuttal with prior context", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ndjsonResponse([{ type: "token", value: "Opening jab." }, { type: "done" }]))
      .mockResolvedValueOnce(ndjsonResponse([{ type: "token", value: "Still not convinced." }, { type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChallengeModal assumption={assumption} onConcede={() => {}} onClose={() => {}} />);
    await screen.findByText("Opening jab.");

    await userEvent.type(screen.getByPlaceholderText(/defend it/i), "We have 10 signed LOIs");
    await userEvent.click(screen.getByRole("button", { name: /defend/i }));

    expect(await screen.findByText("Still not convinced.")).toBeInTheDocument();
    // The second request carried the conversation (opening + the user's defense).
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.messages.at(-1)).toMatchObject({ role: "user", content: "We have 10 signed LOIs" });
  });

  it("fires onConcede then onClose when conceding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([{ type: "done" }])));
    const onConcede = vi.fn();
    const onClose = vi.fn();
    render(<ChallengeModal assumption={assumption} onConcede={onConcede} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /concede/i }));
    expect(onConcede).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("surfaces a stream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([{ type: "error", message: "challenge offline" }])),
    );
    render(<ChallengeModal assumption={assumption} onConcede={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("challenge offline")).toBeInTheDocument());
  });
});
