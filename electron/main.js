// Electron main process — wraps the local Next.js server in a desktop window.
// The Next server keeps running locally, so all API routes (interview, plan,
// research, …) work exactly as in the browser.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");

const isDev = process.env.ELECTRON_DEV === "1";
const appRoot = path.join(__dirname, "..");

// Auto-start the local SearxNG container unless explicitly disabled (Z2H_SEARXNG=0).
const AUTO_SEARXNG = process.env.Z2H_SEARXNG !== "0";

// Resolved at startup: the port the local Next server listens on (a free one is
// picked automatically so a busy :3000 can't blank the app) and the URL we load.
let port = Number(process.env.PORT) || 0;
let appUrl = "";

let serverProcess = null;
let mainWindow = null;

/**
 * Best-effort: bring up the local SearxNG search container so the 🔎 Research
 * feature works out of the box. Detached (`up -d`), non-blocking, and silent if
 * Docker isn't installed/running — research just falls back to its "search
 * backend down" message, exactly as before. The compose file lives at the repo
 * root in dev and under resources/ in the packaged app; we mount `./searxng`
 * relative to it, so we run docker from the compose file's own directory.
 */
function startSearxng() {
  if (!AUTO_SEARXNG) return;
  const composeFile = [
    path.join(appRoot, "docker-compose.searxng.yml"),
    path.join(process.resourcesPath || "", "docker-compose.searxng.yml"),
  ].find((p) => p && fs.existsSync(p));
  if (!composeFile) {
    console.warn("SearxNG: compose file not found; skipping auto-start.");
    return;
  }

  const proc = spawn("docker", ["compose", "-f", composeFile, "up", "-d"], {
    cwd: path.dirname(composeFile),
    stdio: "ignore",
    detached: false,
  });
  proc.on("error", (err) =>
    console.warn(`SearxNG: could not start (Docker missing?) — ${err.message}`),
  );
  proc.on("exit", (code) => {
    if (code === 0) console.log("SearxNG: container is up on http://localhost:8080");
    else console.warn(`SearxNG: docker compose exited with code ${code}.`);
  });
}

/** Ask the OS for an open port so we never collide with whatever's on :3000. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
  });
}

/** In production, start `next start` using Electron's bundled Node. */
function startServer() {
  if (isDev) return; // dev: `next dev` is already running (see scripts)
  const nextBin = require.resolve("next/dist/bin/next", { paths: [appRoot] });
  // A packaged GUI app has no console attached, so tee the server's output to a
  // log file — it's the only way to diagnose a startup failure after the fact.
  const logFd = fs.openSync(path.join(app.getPath("userData"), "server.log"), "a");
  serverProcess = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: appRoot,
      env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", logFd, logFd],
    },
  );
  serverProcess.on("error", (err) => console.error("Failed to start Next server:", err));
}

/** Resolve once the local server answers (or reject after a timeout). */
function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(appUrl, () => resolve());
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("Next server did not start in time"));
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

/** A tiny dark splash so the window is never an unexplained black void. */
function loadingHtml() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <body style="margin:0;height:100vh;display:flex;flex-direction:column;gap:18px;
      align-items:center;justify-content:center;background:#0a0a0b;color:#e5e7eb;
      font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">
      <div style="width:34px;height:34px;border:3px solid #1f2937;border-top-color:#6366f1;
        border-radius:50%;animation:s .8s linear infinite"></div>
      <div>Starting Zero2Hero…</div>
      <style>@keyframes s{to{transform:rotate(360deg)}}</style>
    </body>`)}`;
}

/** Shown if the server never came up — beats a silent black screen. */
function errorHtml(message) {
  const logPath = path.join(app.getPath("userData"), "server.log");
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <body style="margin:0;min-height:100vh;box-sizing:border-box;padding:48px;
      background:#0a0a0b;color:#e5e7eb;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif">
      <h1 style="font-size:20px;margin:0 0 12px">Zero2Hero couldn't start</h1>
      <p style="color:#9ca3af;max-width:60ch;margin:0 0 16px">
        The local app server didn't come up. This is usually a one-off — quitting and
        reopening fixes it. If it keeps happening, the log below has the details.</p>
      <pre style="background:#111114;border:1px solid #1f2937;border-radius:8px;padding:12px;
        color:#9ca3af;white-space:pre-wrap;word-break:break-word">${message}</pre>
      <p style="color:#6b7280;font-size:13px">Log: ${logPath}</p>
    </body>`)}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0b",
    title: "Zero2Hero",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (source citations, "get a key", etc.) in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.startsWith(appUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // If the app URL ever fails to load, surface why instead of a black screen.
  // (-3 is ABORTED, e.g. a superseded navigation; the data: splash/error pages
  // aren't http, so this only fires for the real app.)
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url.startsWith("http")) {
      mainWindow.loadURL(errorHtml(`${desc} (${code})`));
    }
  });

  mainWindow.loadURL(loadingHtml()); // instant splash while the server boots
  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // chrome-free window — no File/Edit/View… bar

  if (!port) port = isDev ? 3000 : await getFreePort().catch(() => 3000);
  appUrl = `http://localhost:${port}`;

  startSearxng(); // fire-and-forget; research works the moment it's up
  startServer();
  createWindow();
  try {
    await waitForServer();
    mainWindow.loadURL(appUrl);
  } catch (err) {
    console.error(err);
    if (mainWindow) mainWindow.loadURL(errorHtml(String((err && err.message) || err)));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProcess) serverProcess.kill();
});
