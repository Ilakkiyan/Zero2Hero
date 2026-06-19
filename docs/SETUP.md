# Zero2Hero — First-Time Setup

Get the app running from a fresh clone. The default path is **fully local and
free** (no API key, no cloud) — everything else is optional.

---

## TL;DR (fully local, ~5 min)

```bash
# 1. Install Ollama (the local model runtime):  https://ollama.com/download
#    macOS:   https://ollama.com/download/mac
#    Windows: https://ollama.com/download/windows
#    Linux:   curl -fsSL https://ollama.com/install.sh | sh

# 2. From the repo root:
npm install
cp .env.example .env.local        # defaults to LLM_PROVIDER=ollama (local)
npm run llm:pull                  # ollama pull qwen2.5:14b  (~9 GB, one time)
npm run dev                       # → http://localhost:3000

# Optional — local web research (needs Docker). Start it alongside the app:
docker compose -f docker-compose.searxng.yml up -d   # 🔎 Research → http://localhost:8080
```

Open **http://localhost:3000**. The home page shows a live setup banner that
tells you exactly what's missing until the local model is ready — then it turns
into a small "model ready" chip and you're good to go.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 18+ (20 LTS recommended) | runs Next.js, the tests |
| **npm** | bundled with Node | install + scripts |
| **Ollama** | latest | the local model backend (default provider) |
| **Docker** | optional | local web research via SearxNG |

Check what you have:

```bash
node -v && npm -v
ollama --version       # after installing Ollama
```

---

## Step-by-step

### 1. Install dependencies

```bash
npm install
```

### 2. Create your env file

```bash
cp .env.example .env.local
```

The defaults run everything locally (`LLM_PROVIDER=ollama`, model
`qwen2.5:14b`). `.env.local` is git-ignored — never commit real keys.

### 3. Pull the local model

```bash
npm run llm:pull        # = ollama pull qwen2.5:14b
```

Make sure the Ollama app/daemon is running (it listens on
`http://localhost:11434`). Verify:

```bash
curl http://localhost:11434/api/tags
```

### 4. Run it

```bash
npm run dev             # → http://localhost:3000
```

### 5. Smoke-test the flow

1. Click **Load sample idea** → **Generate execution plan**.
2. Try **⚔️ Challenge** (red-teams your weakest assumption), **🔎 Research**
   (links cited evidence onto assumptions), and the **▶ Your next move** banner.
3. **📄 Export pitch** opens a print-ready one-pager at `/pitch`.

---

## Optional add-ons

All optional — the app runs fully without any of these.

### ☁️ Cloud model (Azure OpenAI)

Flip the header toggle to **☁ Cloud** and set these in `.env.local`, then
restart `npm run dev`:

```bash
LLM_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-06-01
```

### 🔎 Local web research (SearxNG, no key)

Web research runs **exclusively** on a local, private SearxNG container — no API
key, no third-party services. The [desktop app](#️-run-as-a-desktop-app-electron)
starts it for you; to run it by hand (needs Docker):

```bash
docker compose -f docker-compose.searxng.yml up -d   # serves http://localhost:8080
```

JSON output is pre-enabled in `searxng/settings.yml`. If SearxNG isn't running,
the **🔎 Research** button will report the search backend is down.

### 📅 Google Calendar sync (optional)

One-time OAuth setup (~5 min) — see the **Google Calendar sync setup** section
in [`README.md`](../README.md). Add to `.env.local`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback
```

### 🖥️ Run as a desktop app (Electron)

The desktop app is the recommended way to run Zero2Hero — a native window (not a
browser tab) that **auto-starts the local SearxNG container** so 🔎 Research works
with zero setup (best-effort; needs Docker running, set `Z2H_SEARXNG=0` to skip).

```bash
npm run desktop:dev     # dev window against `next dev`
# or
npm run desktop         # production build, then open the window
npm run dist            # build installers (.dmg / .exe / AppImage) → ./release
```

---

## Running the tests

Fully mocked and offline — no providers required.

```bash
npm run test            # Vitest: unit + API-route + component
npm run test:e2e        # Playwright browser smoke (mocked API)
npm run test:all        # build → unit/API/component → E2E
```

The first `test:e2e` run downloads a browser:

```bash
npx playwright install chromium
```

> **macOS note:** if that fails with `EACCES … ms-playwright`, your browser
> cache is owned by `root` (from an old `sudo` install). Install into a path you
> own and point the test run at it:
>
> ```bash
> export PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/pw-browsers"
> npx playwright install chromium
> npm run test:e2e        # same shell, so it uses that path
> ```

Optional **real** local-LLM round-trip (skipped unless you opt in):

```bash
RUN_LOCAL_LLM=1 npm run llm:smoke
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Banner says "Ollama not detected" | Start the Ollama app; confirm `curl http://localhost:11434/api/tags` responds. |
| Banner says "pull the model" | `npm run llm:pull` (or `ollama pull qwen2.5:14b`). |
| `Port 3000 is in use` | Stop the other process, or run `PORT=3001 npm run dev`. |
| 🔎 Research errors immediately | Start SearxNG (`docker compose -f docker-compose.searxng.yml up -d`), or launch the desktop app which starts it for you. Make sure Docker is running. |
| Plans feel slow on first run | First Ollama call loads the model into memory; subsequent calls are fast. A bigger machine / smaller model helps. |
| E2E can't find a browser | See the macOS Playwright note above. |
