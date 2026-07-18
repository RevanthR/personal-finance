// Quick visual check: node scripts/screenshot.mjs <path> [out.png]
// Requires the dev server running on localhost:3000.
import { chromium } from "playwright";

const path = process.argv[2] ?? "/";
const out = process.argv[3] ?? "scratch/screenshot.png";
const url = `http://localhost:3000${path}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();

console.log(`Saved ${url} -> ${out}`);
