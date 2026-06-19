import { NextRequest, NextResponse } from "next/server";
import { chatJSON } from "@/lib/llm";
import {
  FIELDTEST_DESIGN_SYSTEM,
  FIELDTEST_CAPTURE_SYSTEM,
  fieldTestDesignMessage,
  fieldTestCaptureMessage,
} from "@/lib/prompts";
import { IdeaBriefSchema, AssumptionSchema } from "@/lib/schema";
import { parseFieldTestDesign, parseFieldTestResult } from "@/lib/fieldtest";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Field Test ("past the plan"). Two modes:
 *  - design:  brief + assumption → the cheapest real-world test kit (any
 *             method/scale; offline/manual is first-class — NOT assumed software).
 *  - capture: brief + assumption + what actually happened → stance + suggested
 *             status, which the client attaches as PRIMARY (field) evidence.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const provider = req.headers.get("x-llm-provider") || undefined;
  const model = req.headers.get("x-llm-model") || undefined;
  const opts = { provider, model, signal: req.signal };

  try {
    const body = await req.json();

    const brief = IdeaBriefSchema.safeParse(body.brief);
    const assumption = AssumptionSchema.safeParse(body.assumption);
    if (!brief.success || !assumption.success) {
      return NextResponse.json({ error: "brief and assumption required" }, { status: 400 });
    }

    if (body.mode === "design") {
      const raw = await chatJSON(
        [
          { role: "system", content: FIELDTEST_DESIGN_SYSTEM },
          { role: "user", content: fieldTestDesignMessage(brief.data, assumption.data) },
        ],
        opts,
      );
      const design = parseFieldTestDesign(raw);
      if (!design) {
        return NextResponse.json({ error: "Test design did not match schema" }, { status: 422 });
      }
      return NextResponse.json({ design });
    }

    if (body.mode === "capture") {
      const rawResult = typeof body.result === "string" ? body.result.trim() : "";
      const method = typeof body.method === "string" ? body.method : "Field test";
      if (!rawResult) {
        return NextResponse.json({ error: "result required" }, { status: 400 });
      }
      const raw = await chatJSON(
        [
          { role: "system", content: FIELDTEST_CAPTURE_SYSTEM },
          {
            role: "user",
            content: fieldTestCaptureMessage(brief.data, assumption.data, method, rawResult),
          },
        ],
        opts,
      );
      const result = parseFieldTestResult(raw);
      if (!result) {
        return NextResponse.json({ error: "Result read did not match schema" }, { status: 422 });
      }
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "mode must be 'design' or 'capture'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
