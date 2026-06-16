"use client";

import type { PlanEvent, PlanEventKind } from "@/lib/schema";
import { netDelta } from "@/lib/history";

/**
 * The de-risking timeline: a dependency-free sparkline of how plan confidence
 * has moved, plus an annotated log of what changed and why. This is the visible
 * proof that the plan is *living* — judges watch the number climb as the idea
 * gets de-risked. Renders from the event history page.tsx records on every
 * mutation; no extra model calls.
 */

const kindIcon: Record<PlanEventKind, string> = {
  created: "✦",
  status: "◉",
  evidence: "🔎",
  replan: "↻",
};

export default function ConfidenceTimeline({ history }: { history: PlanEvent[] }) {
  if (history.length === 0) return null;

  const values = history.map((e) => e.confidence);
  const current = values[values.length - 1];
  const net = netDelta(history);
  const trend = net > 0 ? "up" : net < 0 ? "down" : "flat";
  const trendColor =
    trend === "up" ? "text-risk-low" : trend === "down" ? "text-risk-high" : "text-muted";

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          De-risking timeline
        </h3>
        {history.length > 1 && (
          <span className={`text-xs font-semibold ${trendColor}`}>
            {net > 0 ? "▲" : net < 0 ? "▼" : "■"} {net > 0 ? "+" : ""}
            {net}% overall
          </span>
        )}
        <span className="ml-auto text-xs text-muted">now {current}%</span>
      </div>

      <Sparkline values={values} trendColor={trendColor} />

      <ol className="space-y-1.5">
        {history
          .map((e, i) => ({ e, i }))
          .slice(-6)
          .reverse()
          .map(({ e, i }) => {
            const delta = i > 0 ? e.confidence - history[i - 1].confidence : 0;
            return (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 shrink-0 text-center text-muted">{kindIcon[e.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-text">{e.label}</span>
                {delta !== 0 && (
                  <span
                    className={`shrink-0 font-medium ${delta > 0 ? "text-risk-low" : "text-risk-high"}`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
                <span className="w-8 shrink-0 text-right tabular-nums text-muted">{e.confidence}%</span>
              </li>
            );
          })}
      </ol>
      {history.length > 6 && (
        <p className="text-[10px] text-muted">+{history.length - 6} earlier steps</p>
      )}
    </section>
  );
}

/** Inline-SVG sparkline. Scales to the data range (with padding) so small but
 * real confidence moves stay visible without exaggerating noise. */
function Sparkline({ values, trendColor }: { values: number[]; trendColor: string }) {
  const W = 100;
  const H = 32;

  if (values.length < 2) {
    return (
      <p className="text-xs text-muted">
        One data point so far — validate assumptions or run research to chart the trajectory.
      </p>
    );
  }

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.15, 4);
  let min = Math.max(0, lo - pad);
  let max = Math.min(100, hi + pad);
  if (max - min < 15) {
    const mid = (min + max) / 2;
    min = Math.max(0, mid - 7.5);
    max = Math.min(100, mid + 7.5);
  }

  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const pts = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `0,${H} ${pts} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`h-10 w-full ${trendColor}`}
      role="img"
      aria-label="Confidence trajectory"
    >
      <polygon points={area} fill="currentColor" opacity={0.1} />
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={1.6} fill="currentColor" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
