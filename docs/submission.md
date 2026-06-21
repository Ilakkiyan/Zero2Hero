# Zero2Hero — Hackathon submission drafts

Working drafts for the USAII Global AI Hackathon 2026 (College track). Kept in
the repo so they carry across machines. Note: the user prefers **no em dashes**
in copy pasted into submission fields — swap for commas/periods where needed.

- [Elevator pitch / tagline](#elevator-pitch--tagline)
- [About the project (Devpost story)](#about-the-project-devpost-story)
- [Built with](#built-with)
- [Demo video script (3:00, Devpost structure)](#demo-video-script-300-devpost-structure)
- [Responsible AI talking points](#responsible-ai-talking-points)

---

## Elevator pitch / tagline

**Primary (~192 chars, no em dashes):**

> The honest AI cofounder for ambitious students. It interviews your idea, pressure-tests it with real-world evidence, and gives a build-or-kill verdict, before you spend a semester building it.

Alternates:
- *Punchy:* The AI cofounder that tells ambitious students the truth — is your idea worth building?
- *Responsible-AI lean:* The AI cofounder for ambitious students that won't hype you: real-world evidence and an honest build-or-kill verdict it can't be talked into.

---

## About the project (Devpost story)

## 💡 Inspiration

Every ambitious student has a folder of ideas they're afraid to start. We kept hitting the same trap: you get excited about an idea, you ask a few friends, everyone says *"that's awesome!"* — and then you pour a whole semester into building it before discovering nobody actually wanted it.

The problem isn't a lack of tools. It's a lack of an **honest second opinion**. Friends are encouraging, mentors are busy, and AI assistants are the worst offenders — ask most of them about your idea and they'll happily hype it into existence. We wanted the opposite: a cofounder that *pushes back*, makes us prove our idea with real evidence, and is willing to tell us **"don't build this."**

## ⚙️ What it does

**Zero2Hero** turns a vague idea into an evidence-backed go/no-go decision:

1. **Interviews** you to surface the hidden assumption you didn't say out loud.
2. Builds a **de-risked plan** — ranked assumptions, each with a cheap test, and milestones toward a first version.
3. **Challenges** your weakest assumption like an adversarial cofounder.
4. Designs the cheapest **real-world test** — often *offline* (a sign-up sheet, 10 conversations, a pre-order), never assuming you're building software — and turns what actually happened into **primary evidence**.
5. Moves an **evidence-aware confidence** score and delivers an honest **Build / Don't / Not yet** verdict.
6. Takes you past the plan into a **first version** and a **launch kit**.

## 🛠️ How we built it

- **Next.js 14 (App Router)** full-stack — React UI + Node API routes, streaming responses as NDJSON.
- A **provider-agnostic LLM layer**: fully local and private on **Ollama / Qwen2.5** by default, or **Azure OpenAI** in the cloud — switchable per request.
- **Zod-validated structured output** is the spine: the model emits JSON that's schema-checked at the API boundary, so malformed output never reaches the UI. This is what makes it a *system*, not a chat wrapper.
- **Private web research** via a self-hosted **SearxNG** instance (Docker), with hallucinated citations dropped server-side.
- The confidence score is **evidence-aware** — supporting/undermining results nudge it on top of assumption status:

$$
\text{confidence} = \mathrm{clip}\!\left(50 + \sum_{a} w(a)\,s(a) + \mathrm{clip}\!\Big(\sum_{a} w(a)\,\mathrm{clip}(e_a,-2,2),\,-12,12\Big),\; 5,\; 95\right)
$$

where $w(a)$ is the assumption's risk weight, $s(a)$ its status delta, and $e_a$ its net cited-evidence stance.

- The **next move** and the **Verdict** are derived deterministically (no extra model calls), so the recommendation is consistent and auditable.
- Shipped as a **cross-platform Electron desktop app** (macOS/Windows/Linux) built by **GitHub Actions**, plus a **205-test** suite (unit, API, component, e2e) that runs fully mocked and offline.

## 📚 What we learned

- **Honesty has to be engineered, not prompted once.** The strongest version of "responsible AI" here was architectural: gate "Build" on real evidence, make the AI argue back, and keep a human in the loop for every change.
- **Calibration is model-sensitive.** Getting the AI to judge a real-world result *fairly* took three tries — rules alone made it swing from too harsh to too generous; only **pre-registered pass/fail thresholds + a worked example** pinned it to the right call.
- **Don't assume software.** A solo student's cheapest test is usually offline — so we built every step (test design, first version, launch channels) to fit the *kind* of idea, not default to a web app.
- **Structured output + validation** is the difference between a demo and a product.

## 🧗 Challenges we faced

- **Making the AI honest without making it useless.** Our field-test judge first called an encouraging result *"failed,"* then over-corrected to *"passed"* on a result that missed its own bar. We fixed it by threading the test's pre-registered thresholds into the judgment and anchoring it with an example — verified live across pass / inconclusive / fail cases.
- **Hallucination control** — fabricated sources are dropped server-side so a fake citation can never move the confidence score.
- **Local-first *and* cloud** — one provider-agnostic layer that runs privately on a laptop or on Azure, with the same behavior.
- **Packaging** a Next.js app into signed-free, cross-platform desktop installers in CI.
- **Guardrails that don't backfire** — a safety screen that refuses clearly harmful ideas (server-side, before any model call) while *not* false-positiving on legitimate ones like a "Nerf gun marketplace" or a "malware-detection tool."

## 🚀 What's next

Shareable validated-plan links for mentors, a willingness-to-pay test with real payment links, and an accountability loop that checks back in on your riskiest open assumption.

---

## Built with

```
typescript, javascript, next.js, react, node.js, tailwindcss, zod, electron, electron-builder, ollama, qwen2.5, azure-openai, searxng, docker, docker-compose, google-calendar-api, google-oauth, web-speech-api, localstorage, ndjson, vitest, playwright, testing-library, msw, github-actions
```

---

## Demo video script (3:00, Devpost structure)

Follows the mentor guidance: **lead with impact (before vs. after)**, then show the
tool. Structure: 30 / 60 / 30 / 30 / 30. `[SCREEN]` = what to show, `VO` = voiceover.
Running example: a weekend meal-prep service for dorm students.

**[0:00–0:30] — The problem & who it affects** *(lead with before/after)*
[SCREEN: A student at a laptop / the app with its tagline.]
VO: "Meet the ambitious student with a folder full of ideas they're too scared to start. Right now, here's what happens: they ask a few friends, hear *'that's awesome,'* and sink an entire semester building something nobody actually wanted. The honest feedback that would've saved them never comes — friends encourage, and AI just hypes. **With Zero2Hero, that changes: in an afternoon, a student finds out whether their idea is worth building — backed by real evidence — before they commit a single weekend.**"

**[0:30–1:30] — What the AI does & how**
[SCREEN: Type a rough idea → interview question streams in → generate plan → Challenge → Field Test design appears.]
VO: "Here's how. You describe a rough idea — say, a weekend meal-prep service for dorm students. Instead of cheerleading, Zero2Hero interviews you and surfaces the assumption you didn't say out loud: that students will *pay*, not just complain about the food. It builds a structured, schema-validated plan — ranked risky assumptions, each with a cheap test. Its adversarial cofounder then argues against your weakest one, so you defend it or drop it. Then the key step: it designs the cheapest *real-world* test — and because you're a student doing something small, it picks an *offline* one: a dorm sign-up sheet with the exact script to use. It never assumes you're building an app. Under the hood, it's a Next.js app on a provider-agnostic model layer — fully private on a local model, or Azure in the cloud — with web research that drops hallucinated sources before they're ever shown."

**[1:30–2:00] — One specific moment where it makes a difference**
[SCREEN: Log a real result; the confidence sparkline moves; the Verdict banner updates.]
VO: "Here's the moment that matters. You run that test for real and log what happened — *'asked twelve students, three prepaid.'* Zero2Hero turns that into evidence, and watch: the confidence score moves from **real data, not a hunch.** The verdict updates to *'Not yet — get more proof.'* **That's the difference.** Instead of building for a semester on a feeling, the student got the truth in an afternoon — and knows the one thing left to prove."

**[2:00–2:30] — Responsible AI choice & the human role**
[SCREEN: Type a harmful idea → instant refusal; point to the footer disclaimer; flip the toggle to 💻 Local.]
VO: "Our responsible-AI choice is that **honesty is built into the architecture.** The verdict only says *'Build it'* when *real* evidence backs it — it literally can't be talked into a yes. Harmful ideas are refused on the server, before any model call. And **the human stays in charge**: Zero2Hero only ever *proposes* — the student applies every change and makes the final call. It's a copilot for judgment, not an autopilot — and it can run fully on your own machine, so your idea never leaves it."

**[2:30–3:00] — What you'd build next**
[SCREEN: Short roadmap text, then the logo.]
VO: "Next, we're adding shareable validated-plan links for mentors, a willingness-to-pay test with real payment links, and an accountability loop that checks back on your riskiest assumption. **Zero2Hero: the honest AI cofounder that helps ambitious students find out what's worth building — before they spend a semester building it.**"

Production tips: pre-stage the interview answer and field-test result so nothing
stalls on camera; record on Azure for speed (mention local as the privacy story).

---

## Responsible AI talking points

Use for the "AI responsibility / guardrails" submission question. Responsibility
is layered across **input → reasoning → output → control → privacy** — all
verified in the codebase.

- **Input safety.** Clearly harmful/illegal ideas (weapons, illegal drugs, malware,
  fraud, exploitation, violence) are refused **server-side, before any model call**
  ([lib/safety.ts](../lib/safety.ts); wired into the interview + plan routes), plus a
  prompt-level refusal. The screen is conservative to avoid false positives on
  legitimate ideas.
- **Reasoning — anti-sycophancy by design.** Not a cheerleader: the interview hunts
  the weak assumption, the adversarial cofounder argues *against* the idea, and the
  Verdict is **gated on real (field) evidence** — it can't be talked into a yes
  ([lib/verdict.ts](../lib/verdict.ts), [lib/prompts.ts](../lib/prompts.ts)).
- **Grounding / anti-hallucination.** "Never invent facts"; research uses only what
  findings support; **fabricated citations are dropped server-side** (real URLs only)
  ([lib/research.ts](../lib/research.ts)).
- **Output integrity.** Every model response is **zod-schema-validated** at the API
  boundary (422 on mismatch), so malformed output never reaches the user.
- **Control — human-in-the-loop.** The AI only *proposes*; the user applies every
  change (evidence, status, concede). Nothing auto-commits. A copilot for judgment,
  not an autopilot.
- **Privacy by default.** Runs fully local on Ollama (no data leaves the machine),
  local SearxNG search (no third-party tracking), keys server-side only (never in the
  client bundle), plans in browser localStorage (no server DB), rate-limited routes.
- **Honest about limits.** A persistent disclaimer states it's AI guidance, not
  professional/legal/financial advice — validate independently.
