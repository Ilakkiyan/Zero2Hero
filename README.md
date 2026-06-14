# Zero2Hero

The AI companion that turns a vague idea into a realistic execution plan.

Interview → de-risked idea brief → living execution plan. Built for the USAII Global AI Hackathon 2026.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in ONE provider's keys
npm run dev                  # http://localhost:3000
```

## Choosing a provider

The whole app talks to one seam — [`lib/llm.ts`](lib/llm.ts). Set `LLM_PROVIDER` in `.env.local` to switch backends with zero code changes:

| Provider | `LLM_PROVIDER` | Notes |
|----------|----------------|-------|
| Google Gemini | `gemini` | Free tier, no credit card — **default for the demo** |
| Ollama (local) | `ollama` | Free + unlimited — best for dev iteration |
| Azure OpenAI | `azure` | $100 Azure-for-Students credit — demo-day fallback |

## Architecture

```
app/
  page.tsx              split view: Interview (left) | Plan (right)
  api/interview/route.ts  the de-risking interview loop
  api/plan/route.ts       transcript → structured Plan JSON (zod-validated)
lib/
  llm.ts                provider-agnostic LLM layer (azure | gemini | ollama)
  schema.ts             Plan / Assumption / Milestone types (the spine)
  prompts.ts            interview + planner prompts (core IP — tune here)
components/
  InterviewPanel.tsx    chat
  PlanPanel.tsx         living plan: brief, assumptions, milestones
```

Theming is CSS-variable driven (see [`app/globals.css`](app/globals.css)); dark by default, light-mode toggle is a one-line attribute flip later.

## Security — before posting on Devpost

The API key is handled so a public repo/demo can't leak or get spammed:

- **Never in the repo.** Keys live only in `.env.local`, which is git-ignored (verified not tracked, not in history). The repo you link on Devpost contains no secrets.
- **Server-side only.** `lib/llm.ts` runs in Node API routes; the key is read from `process.env` and never sent to the browser. It is not a `NEXT_PUBLIC_` var, so it's never inlined into the client bundle. Client components import only `type ChatMessage`.
- **Rate limited.** Both API routes apply a per-IP limiter (`lib/ratelimit.ts`) — best-effort spam protection for the public demo. Note: in-memory, so it resets on serverless cold starts; it's a speed bump, not a wall.
- **Backoff.** `lib/llm.ts` retries 429/503 with capped backoff so a free-tier burst doesn't fail the request.

**Do this before going public (the real protection):**
1. **Restrict the key** in [Google AI Studio](https://aistudio.google.com/apikey) → limit it to the Generative Language API (and an HTTP referrer / IP if your host supports a fixed one).
2. **Put the key only in your host's env vars** (e.g. Vercel project settings), never committed.
3. **Rotate the key** right before the demo and again after — a fresh key for the public window limits blast radius.
4. For a hosted demo with real traffic, swap the in-memory limiter for a durable one (Upstash/Redis).

## Roadmap (7-day plan)

- [x] Day 1 — scaffold, provider layer, split-view shell
- [x] Day 2 — streaming interview responses (NDJSON token stream)
- [ ] Day 3 — tune risk-surfacing
- [x] Day 4 — "Draft this" per-milestone copilot (streaming artifact modal)
- [x] Day 5 — re-plan flow ("I tried X, it failed" → plan re-shapes)
- [ ] Day 6 — polish + light mode + deploy
- [ ] Day 7 — rehearse demo
