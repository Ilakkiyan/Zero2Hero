import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("assets", { recursive: true });

// Zero2Hero mark: indigo gradient rounded-square, bold "Z2H" with an upward
// arrow accent (zero → hero). Brand accent #4f46e5 → #7c9cff (app globals.css).
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#7c9cff"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="232" fill="url(#g)"/>
  <path d="M512 196 L past" fill="none"/>
  <!-- upward arrow -->
  <path d="M512 250 l120 150 h-72 v150 h-96 v-150 h-72 z" fill="#ffffff" opacity="0.95"/>
  <text x="512" y="720" font-family="Helvetica Neue, Arial, sans-serif"
        font-size="320" font-weight="800" fill="#ffffff" text-anchor="middle">Z2H</text>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`);
await page.screenshot({ path: "assets/icon.png", omitBackground: true });
await browser.close();
console.log("wrote assets/icon.png");
