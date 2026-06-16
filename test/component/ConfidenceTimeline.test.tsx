import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ConfidenceTimeline from "@/components/ConfidenceTimeline";
import { sampleHistory } from "@/test/fixtures/plan";

describe("ConfidenceTimeline", () => {
  it("renders nothing with an empty history", () => {
    const { container } = render(<ConfidenceTimeline history={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the net overall delta and current confidence", () => {
    render(<ConfidenceTimeline history={sampleHistory} />);
    expect(screen.getByText(/de-risking timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/\+21% overall/)).toBeInTheDocument();
    expect(screen.getByText(/now 71%/)).toBeInTheDocument();
  });

  it("renders the change log labels and per-step deltas", () => {
    render(<ConfidenceTimeline history={sampleHistory} />);
    expect(screen.getByText(/Marked “a1” failed/)).toBeInTheDocument();
    expect(screen.getByText(/2 citations added to “a3”/)).toBeInTheDocument();
    // The dip (50 → 38) shows a negative step, the recovery a positive one.
    expect(screen.getByText("-12")).toBeInTheDocument();
    expect(screen.getByText("+17")).toBeInTheDocument();
  });

  it("draws an SVG sparkline once there are at least two points", () => {
    render(<ConfidenceTimeline history={sampleHistory} />);
    expect(screen.getByRole("img", { name: /confidence trajectory/i })).toBeInTheDocument();
  });

  it("shows a single-point hint instead of a sparkline for one event", () => {
    render(<ConfidenceTimeline history={[sampleHistory[0]]} />);
    expect(screen.getByText(/one data point so far/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /confidence trajectory/i })).toBeNull();
  });
});
