import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "https://chosen-one-q4ox.onrender.com";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
mkdirSync("out/images", { recursive: true });

const shots = [
  { file: "01-landing.png", path: "/#/", wait: "text=Be the shop AI shopping agents" },
  { file: "02-overview.png", path: "/#/app", wait: "text=Your biggest opportunities" },
  {
    file: "03-where-you-lose.png",
    path: "/#/app/lost",
    wait: "text=The shopper said",
    click: "text=Lost before the fixes",
  },
  { file: "04-fixes.png", path: "/#/app/fixes", wait: "text=Fixes the AI drafted", settle: 2500 },
  {
    file: "05-before-vs-after.png",
    path: "/#/app/proof",
    wait: "text=Sales won back after the fixes",
  },
  {
    file: "06-agent-orders.png",
    path: "/#/app/proof",
    wait: "text=Real agent sales",
    scroll: "text=Real agent sales",
    settle: 2500,
  },
  { file: "07-connect-agents.png", path: "/#/app/connect", wait: "text=Let any AI agent shop" },
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
for (const s of shots) {
  await page.goto(BASE + s.path);
  await page.reload();
  await page.waitForSelector(s.wait, { timeout: 60000 });
  if (s.click) await page.click(s.click);
  if (s.scroll) await page.locator(s.scroll).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(s.settle ?? 1200);
  await page.screenshot({ path: `out/images/${s.file}` });
  console.log("saved", s.file);
}
await browser.close();
