// Electron main process — wraps the local Next.js server in a desktop window.
// The Next server keeps running locally, so all API routes (interview, plan,
// research, …) work exactly as in the browser.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const isDev = process.env.ELECTRON_DEV === "1";
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = `http://localhost:${PORT}`;
const appRoot = path.join(__dirname, "..");

let serverProcess = null;
let mainWindow = null;

/** In production, start `next start` using Electron's bundled Node. */
function startServer() {
  if (isDev) return; // dev: `next dev` is already running (see scripts)
  const nextBin = require.resolve("next/dist/bin/next", { paths: [appRoot] });
  serverProcess = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: appRoot,
    env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  serverProcess.on("error", (err) => console.error("Failed to start Next server:", err));
}

/** Resolve once the local server answers (or reject after a timeout). */
function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(APP_URL, () => resolve());
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("Next server did not start in time"));
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
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
    if (url.startsWith("http") && !url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (err) {
    console.error(err);
  }
  createWindow();

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
