# Zero2Hero

The AI companion that turns a vague idea into a realistic execution plan.

Interview → de-risked idea brief → living execution plan. Built for the USAII Global AI Hackathon 2026.

> **First time here?** Follow [docs/SETUP.md](docs/SETUP.md) for step-by-step setup. TL;DR below.

## Quick start (fully local — no API key)

Zero2Hero runs on a local model via [Ollama](https://ollama.com/download) by default — private, free, no quota, no key.

```bash
# 1. Install Ollama:  https://ollama.com/download
#    macOS:  https://ollama.com/download/mac
#    Windows https://ollama.com/download/windows
#    Linux:  curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:30b-a3b        # 2. pull the model

npm install
cp .env.example .env.local    # defaults to LLM_PROVIDER=ollama
npm run dev                   # 3. http://localhost:3000

# Optional — local web research (needs Docker). Start it alongside the app:
docker compose -f docker-compose.searxng.yml up -d   # 🔎 Research → http://localhost:8080
```

The home page shows a setup guide (with download links) and a live status check until the local model is ready.

### Web research (also local — SearxNG)

Research plans its sub-questions and synthesizes on your **local model**; only the web *search* is external, via a local **SearxNG** instance (no key). Needs Docker:

```bash
docker compose -f docker-compose.searxng.yml up -d   # serves http://localhost:8080
```

The JSON API is pre-enabled in [`searxng/settings.yml`](searxng/settings.yml). Then click **🔎 Research** — it searches locally.

**Prefer cloud search?** Add a free Gemini key via the in-app **Key** button and research uses Gemini Google-Search grounding instead — you always have that option. (`SEARXNG_URL` overrides the search endpoint.)

## Bring your own key (BYOK)

Users can paste their own free Gemini key via the **Key** button in the header — it's stored in their browser (localStorage) and sent with each request as `x-gemini-key`, used server-side for that request only and **never persisted or logged**. Priority is **user key → `GEMINI_API_KEY` env fallback**.

- **Local dev:** set `GEMINI_API_KEY` in `.env.local` and the app just works.
- **Public deploy (Devpost):** *don't* set `GEMINI_API_KEY` in the host env → every visitor must bring their own key, so your quota is never spent (and there's no shared key to spam).

## Choosing a provider — in-app toggle

A **Cloud / Local toggle** in the header switches the model backend per request (no restart):

| Toggle | Provider | Notes |
|--------|----------|-------|
| **☁ Cloud** | Azure OpenAI | Quality + deployable; runs on the $100 Azure-for-Students credit. Set `AZURE_OPENAI_*` in `.env.local`. |
| **💻 Local** | Ollama (`qwen3:30b-a3b`) | Free, private, offline — the robust fallback. |

The toggle sends an `x-llm-provider` header that [`lib/llm.ts`](lib/llm.ts) honors per request (server `LLM_PROVIDER` is the default when no header). Gemini remains available as an `LLM_PROVIDER`/research-search option.

## Run as a desktop app (Electron)

Zero2Hero also runs as a native desktop window — Electron wraps the local Next.js
server, so every feature (interview, plan, research, calendar…) works the same.

```bash
npm install
npm run desktop:dev     # dev: launches a desktop window against `next dev`
# or
npm run desktop         # prod: next build, then open the app window
```

On launch the desktop app also **auto-starts the local SearxNG container** (`docker compose … up -d`) so 🔎 Research works out of the box — best-effort, and silently skipped if Docker isn't installed/running. Set `Z2H_SEARXNG=0` to disable it (e.g. if you start SearxNG yourself).

Build installers (`.exe` / `.dmg` / `AppImage`) with:

```bash
npm run dist            # output in ./release  (test on your own machine)
```

External links (citations, "get a key") open in the system browser. The desktop
build is fully local-capable — flip the header toggle to **💻 Local** and it
runs offline on Ollama.

## Architecture

```
app/
  page.tsx              split view: Interview (left) | Plan (right)
  api/interview/route.ts  the de-risking interview loop
  api/plan/route.ts       transcript → structured Plan JSON (zod-validated)
lib/
  llm.ts                provider-agnostic LLM layer (azure | gemini | ollama)
  schema.ts             Plan / Assumption / Evidence / PlanEvent types (the spine)
  prompts.ts            interview + planner + challenge + evidence prompts (core IP)
  research.ts           agentic research + Evidence Engine (findings → assumptions)
  validation.ts         evidence-aware confidence scoring
  history.ts            de-risking timeline (confidence trajectory)
  nextMove.ts           the single highest-leverage next action
components/
  InterviewPanel.tsx    chat
  PlanPanel.tsx         living plan: brief, assumptions, milestones, evidence
  ConfidenceTimeline.tsx  sparkline + annotated change log
  ChallengeModal.tsx    adversarial cofounder (red-team one assumption)
  ResearchModal.tsx     agentic research + apply linked evidence
```

Theming is CSS-variable driven (see [`app/globals.css`](app/globals.css)); dark by default, light-mode toggle is a one-line attribute flip later.

## The de-risking loop (what makes it wow)

Zero2Hero isn't a planner that hands you a list — it tries to *prove or kill* your idea with evidence, live, and reshapes the plan as it learns. Four connected pieces turn the separate tools into one evidence-driven system:

- **Evidence Engine** — `🔎 Research` doesn't just write a brief. The agent maps each finding back onto your assumptions as **cited evidence** (supports / undermines), proposes a status change, and you apply it in one click. Hallucinated citations are dropped server-side ([`lib/research.ts`](lib/research.ts)).
- **De-risking timeline** — every change snapshots confidence, drawn as a sparkline + "what changed & why" log. Watch the number move as the idea gets de-risked ([`components/ConfidenceTimeline.tsx`](components/ConfidenceTimeline.tsx)).
- **Adversarial cofounder** — `⚔️ Challenge` red-teams your weakest assumption and argues it's wrong. Defend it, or **concede** → it marks the assumption failed and re-plans. A cofounder that pushes back, not a yes-man ([`components/ChallengeModal.tsx`](components/ChallengeModal.tsx)).
- **Decisive next move** — a banner names the ONE highest-leverage action right now (validate the riskiest open assumption, then ship), with one-click **Draft it** ([`lib/nextMove.ts`](lib/nextMove.ts)).

Confidence is **evidence-aware**: supporting/undermining citations nudge it (bounded) on top of assumption status ([`lib/validation.ts`](lib/validation.ts)). Everything runs offline on the local model + SearxNG.

## Testing

A full, deterministic test suite pressure-tests every feature. Default runs are
**fully mocked and offline** — no Azure, Gemini, Google Calendar, SearxNG, or
Ollama required ([`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs all
of it on push/PR).

```bash
npm run test        # Vitest: unit + API-route + component (jsdom)
npm run test:watch  # Vitest watch mode
npm run test:e2e    # Playwright browser smoke (mocked API responses)
npm run test:all    # build → unit/API/component → E2E
```

| Layer | Location | Covers |
|-------|----------|--------|
| **Unit** | [`test/unit`](test/unit) | schema/evidence/event defaults + legacy parsing, evidence-aware confidence scoring, history/timeline helpers, next-move derivation, provider selection / `apiHeaders`, rate limiter, prompt builders, research + Evidence Engine (local vs cloud), Google Calendar helpers |
| **API** | [`test/api`](test/api) | every route — plan/replan 422 on bad JSON, streaming NDJSON + marker stripping + error events, research backends + assumption pass-through, challenge (adversarial), health, key verification, calendar auth/callback/sync |
| **Component** | [`test/component`](test/component) | interview seed + stream, setup-banner states, provider toggle, assumption tracker, confidence dashboard + timeline, evidence apply, challenge concede, next-move draft, research/stream modals, pitch one-pager |
| **E2E** | [`test/e2e`](test/e2e) | full WOW arc — load sample → generate → next move → challenge → concede → re-plan → research evidence → timeline → persist → pitch |

The first Playwright run downloads a browser (`npx playwright install chromium`).
If your machine has a root-owned `~/Library/Caches/ms-playwright` from an old
`sudo` install, install into a writable path instead:
`PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/pw-browsers" npx playwright install chromium`
(and prefix `npm run test:e2e` with the same env var).

### Optional: real local-LLM smoke

A real round-trip against local Ollama, kept out of default CI so it stays fast:

```bash
npm run llm:pull                  # ollama pull qwen3:30b-a3b  (~18 GB, the app default)
RUN_LOCAL_LLM=1 npm run llm:smoke # asserts a non-empty /api/chat response
```

Without `RUN_LOCAL_LLM=1` the smoke is skipped, so it never blocks a normal run.

## Deploy to Vercel

Standard Next.js app — Vercel auto-detects it. No database, no build config needed.

1. [vercel.com/new](https://vercel.com/new) → **Import** the `Ilakkiyan/Zero2Hero` GitHub repo → **Deploy**.
2. **Environment variables** (Project → Settings → Environment Variables):
   - `GEMINI_MODEL` = `gemini-2.5-flash`
   - **Leave `GEMINI_API_KEY` UNSET** → enforces BYOK (visitors use their own key; your quota is never spent).
   - *(optional, for Calendar)* `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
     `GOOGLE_REDIRECT_URI` = `https://<your-app>.vercel.app/api/calendar/callback`
3. **If using Calendar:** add that same `https://<your-app>.vercel.app/api/calendar/callback`
   to the OAuth client's **Authorized redirect URIs** in Google Cloud Console.
4. Redeploy after setting env vars. Done — share the `.vercel.app` URL.

> The agentic research route is capped at `maxDuration = 60` for the Hobby plan; raise to 300 on Pro if needed.

## Google Calendar sync setup

The "Add to Google Calendar" button needs a Google OAuth client (one-time, ~5 min):

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **OAuth consent screen →** User type **External**, fill the basics, keep it in **Testing**, and add your Google account under **Test users** (no app verification needed in testing).
4. **Credentials → Create credentials → OAuth client ID → Web application.** Under **Authorized redirect URIs** add exactly:
   `http://localhost:3000/api/calendar/callback` (and your deployed URL's `/api/calendar/callback` later).
5. Copy the client ID + secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback
   ```
6. Restart `npm run dev`. Generate a plan → **Add to Google Calendar** → consent once → milestones appear as events.

Tokens are short-lived and held in an httpOnly cookie (never exposed to the browser). The flow degrades gracefully if the vars are unset (the button shows a connection error rather than crashing).

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
- [ ] Day 6 — polish + deploy (light-mode toggle ✅ done)
- [ ] Day 7 — rehearse demo

## WOW backlog (post-loop features)

Core loop (interview → plan → draft → re-plan) is done. These deepen the "wow":

**Tier 1 — highest impact / lowest effort**
- [x] **Calendar sync** — Google Calendar OAuth: one event per milestone. *Bridges plan → real life.* (see setup below)
- [ ] **Plan persistence (localStorage)** — survive reload; also protects the live demo. Foundation for share/export.
- [x] **Pitch one-pager export** — print-to-PDF of brief + assumptions + milestones at `/pitch`. *Targets the Best Pitch award.*

**Tier 2 — high impact / medium effort**
- [x] **Voice input** for the interview (Web Speech API — free, browser-native). *Live-demo dazzle.*
- [x] **Assumption test tracker → auto re-plan** — log each cheap test's result; feed it straight into `/api/replan`. *Closes the de-risking loop visibly.*
- [x] **Agentic research** — one-click research agent: plans sub-questions → runs a grounded search per question (live progress) → synthesizes a brief with all cited sources (local SearxNG or Gemini grounding).

**Tier 3 — stretch**
- [ ] **Shareable plan link** (tiny KV store → URL for mentors/teammates)
- [x] **Pre-mortem generator** — "what could kill this in 30 days" (failure modes + early signs + prevention)
- [x] **Confidence meter** — evidence-aware confidence + biggest unknowns + next cheapest test

**Evidence-driven loop (the headline wow)**
- [x] **Evidence Engine** — research findings auto-link to assumptions as cited evidence + move confidence
- [x] **De-risking timeline** — confidence trajectory sparkline + annotated change log
- [x] **Adversarial cofounder** — interactive red-team of the weakest assumption → concede → re-plan
- [x] **Decisive next move** — the single highest-leverage action, one-click to draft
