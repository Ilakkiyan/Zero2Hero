import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InterviewPanel from "@/components/InterviewPanel";
import type { ChatMessage } from "@/lib/llm";
import { ndjsonResponse } from "./stream";

afterEach(() => vi.unstubAllGlobals());

describe("InterviewPanel", () => {
  it("shows the empty state and fires onLoadSample", async () => {
    const onLoadSample = vi.fn();
    render(
      <InterviewPanel
        messages={[]}
        setMessages={() => {}}
        readyToPlan={false}
        setReadyToPlan={() => {}}
        onGeneratePlan={() => {}}
        onLoadSample={onLoadSample}
        planning={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /load sample idea/i }));
    expect(onLoadSample).toHaveBeenCalledOnce();
  });

  it("renders existing messages and the Generate plan CTA once ready", async () => {
    const onGeneratePlan = vi.fn();
    const messages: ChatMessage[] = [
      { role: "user", content: "my idea" },
      { role: "assistant", content: "a sharp question" },
    ];
    render(
      <InterviewPanel
        messages={messages}
        setMessages={() => {}}
        readyToPlan
        setReadyToPlan={() => {}}
        onGeneratePlan={onGeneratePlan}
        onLoadSample={() => {}}
        planning={false}
      />,
    );
    expect(screen.getByText("my idea")).toBeInTheDocument();
    expect(screen.getByText("a sharp question")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /generate execution plan/i }));
    expect(onGeneratePlan).toHaveBeenCalledOnce();
  });

  it("streams the assistant reply and reveals the CTA when ready_to_plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "token", value: "Here is " },
          { type: "token", value: "my answer." },
          { type: "done", readyToPlan: true },
        ]),
      ),
    );

    function Harness() {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const [ready, setReady] = useState(false);
      return (
        <InterviewPanel
          messages={messages}
          setMessages={setMessages}
          readyToPlan={ready}
          setReadyToPlan={setReady}
          onGeneratePlan={() => {}}
          onLoadSample={() => {}}
          planning={false}
        />
      );
    }

    render(<Harness />);
    await userEvent.type(screen.getByPlaceholderText(/type your idea/i), "build a thing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Here is my answer.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate execution plan/i })).toBeInTheDocument(),
    );
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/interview");
  });

  it("surfaces a stream error to the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([{ type: "error", message: "model offline" }])),
    );

    function Harness() {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return (
        <InterviewPanel
          messages={messages}
          setMessages={setMessages}
          readyToPlan={false}
          setReadyToPlan={() => {}}
          onGeneratePlan={() => {}}
          onLoadSample={() => {}}
          planning={false}
        />
      );
    }

    render(<Harness />);
    await userEvent.type(screen.getByPlaceholderText(/type your idea/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("model offline")).toBeInTheDocument();
  });
});
