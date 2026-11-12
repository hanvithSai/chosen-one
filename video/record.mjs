/**
 * Records each scene of the demo video from the live site with Playwright (library + Edge).
 * Scene lengths and the timing of every on-screen action come from build/manifest.json, which
 * is generated from the measured narration audio, so visuals and voice line up by construction.
 * Captions are NOT recorded here: they are burned in by assemble.mjs from the same manifest.
 *
 *   node record.mjs            record every scene
 *   node record.mjs s3 s4      record only these scenes
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { BASE, EDGE, env, freshApprovalUrl } from "./lib.mjs";

const manifest = JSON.parse(readFileSync("build/manifest.json", "utf8"));
const byId = Object.fromEntries(manifest.scenes.map((s) => [s.id, s]));
const only = process.argv.slice(2);
const VIEW = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERLAY_CSS = `
.co-cursor{position:fixed;left:-50px;top:-50px;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
  border:3px solid #b5653a;background:rgba(181,101,58,.28);z-index:2147483647;pointer-events:none;
  transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1)}
.co-ripple{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(181,101,58,.5);
  z-index:2147483646;pointer-events:none;animation:co-r .6s ease-out forwards}
@keyframes co-r{from{transform:scale(.6);opacity:.9}to{transform:scale(3.2);opacity:0}}
.co-hl{outline:4px solid #f59e0b !important;outline-offset:4px;border-radius:12px;transition:outline-color .2s}
html{scroll-behavior:smooth}`;

async function overlay(page) {
  await page.addStyleTag({ content: OVERLAY_CSS }).catch(() => {});
  await page
    .evaluate(() => {
      if (!document.querySelector(".co-cursor")) {
        const c = document.createElement("div");
        c.className = "co-cursor";
        document.body.appendChild(c);
      }
    })
    .catch(() => {});
}

async function cursorTo(page, x, y) {
  await page.evaluate(([px, py]) => {
    const c = document.querySelector(".co-cursor");
    if (c) { c.style.left = px + "px"; c.style.top = py + "px"; }
  }, [x, y]);
  await sleep(750);
}

async function point(page, loc) {
  const box = await loc.boundingBox();
  if (!box) return;
  await cursorTo(page, box.x + Math.min(box.width / 2, 160), box.y + box.height / 2);
}

async function click(page, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await point(page, loc);
  const box = await loc.boundingBox();
  if (box) {
    await page.evaluate(([x, y]) => {
      const r = document.createElement("div");
      r.className = "co-ripple";
      r.style.left = x + "px"; r.style.top = y + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, [box.x + Math.min(box.width / 2, 160), box.y + box.height / 2]);
  }
  await loc.click();
}

const hl = (loc, on = true) => loc.evaluate((el, v) => el.classList.toggle("co-hl", v), on).catch(() => {});
const center = (loc) => loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" })).catch(() => {});

/** A full-screen magenta flash. assemble.mjs finds its last frame to align the cut exactly. */
async function syncFlash(page) {
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "co-sync";
    d.style.cssText = "position:fixed;inset:0;background:#ff00ff;z-index:2147483647";
    document.body.appendChild(d);
  });
  await sleep(500);
  await page.evaluate(() => document.getElementById("co-sync")?.remove());
}

/** Starts a recorded page and returns a clock that waits until a given second of the scene. */
async function open(browser, id, url, ready) {
  const dir = `build/vid/${id}`;
  rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir, size: VIEW } });
  const created = Date.now();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (ready) await page.waitForSelector(ready, { timeout: 60000 });
  await overlay(page);
  await sleep(300);
  await syncFlash(page);
  const t0 = Date.now();
  const scene = byId[id];
  return {
    ctx, page, scene, lead: (t0 - created) / 1000,
    at: async (sec) => { const w = t0 + sec * 1000 - Date.now(); if (w > 0) await sleep(w); },
    now: () => (Date.now() - t0) / 1000,
    sent: (i) => scene.sentences[i]?.offset ?? 0,
  };
}

async function close(s, extra = {}) {
  await s.at(s.scene.duration);
  const video = s.page.video();
  await s.ctx.close();
  const file = await video.path();
  const out = `build/vid/${s.scene.id}.webm`;
  renameSync(file, out);
  writeFileSync(`build/vid/${s.scene.id}.json`, JSON.stringify({ lead: s.lead, duration: s.scene.duration, ...extra }, null, 2));
  console.log(`recorded ${s.scene.id}  lead=${s.lead.toFixed(2)}s  len=${s.scene.duration.toFixed(1)}s`);
}

const nav = (page, label) => page.locator(`nav[aria-label="Merchant app"] button:has-text("${label}")`);

const scenes = {
  async s1(b) {
    const s = await open(b, "s1", BASE + "/#/", "text=Be the shop AI shopping agents");
    await s.at(s.sent(1) + 0.5);
    await point(s.page, s.page.locator("text=PICKRATE · MAYABAZAR").first());
    await s.at(s.sent(3));
    await hl(s.page.locator("h1").first());
    await close(s);
  },
  async s2(b) {
    const s = await open(b, "s2", BASE + "/#/", "text=Be the shop AI shopping agents");
    await s.at(s.sent(0));
    await center(s.page.locator("#how h2"));
    await s.at(s.sent(1));
    await hl(s.page.locator("#how ol li").first());
    await s.at(s.sent(2) - 0.2);
    await hl(s.page.locator("#how ol li").first(), false);
    await center(s.page.locator("#features h2"));
    await s.at(s.sent(2) + 3);
    await center(s.page.locator("section.bg-ink"));
    await close(s);
  },
  async s3(b) {
    const s = await open(b, "s3", BASE + "/#/", "text=Be the shop AI shopping agents");
    await click(s.page, s.page.locator('header button:has-text("Open the demo")'));
    await s.page.waitForSelector("text=Your biggest opportunities", { timeout: 60000 });
    await overlay(s.page);
    await s.at(s.sent(0) + 3.2);
    await center(s.page.locator("section:has-text('Who the AI shoppers chose')").last());
    await s.at(s.sent(1) + 0.5);
    await hl(s.page.locator("section:has-text('Who the AI shoppers chose')").last());
    await s.at(s.sent(2));
    await point(s.page, s.page.locator("span:text-is('Before fixes')").first());
    await close(s);
  },
  async s4(b) {
    const s = await open(b, "s4", BASE + "/#/app", "text=Your biggest opportunities");
    await s.at(0.3);
    await click(s.page, nav(s.page, "Where you lose"));
    await s.page.waitForSelector("text=The shopper said", { timeout: 30000 });
    await s.at(1.6);
    await click(s.page, s.page.locator('button[role="tab"]:has-text("Lost before the fixes")'));
    await s.at(s.sent(1) - 0.3);
    const card = s.page.locator("li:has-text('food-safe clay chai cups')").first();
    await center(card);
    await s.at(s.sent(1));
    await hl(card.locator("p:has-text('The shopper said')"));
    await s.at(s.sent(2));
    await hl(card.locator("p:has-text('The shopper said')"), false);
    await s.at(s.sent(3));
    await hl(card.locator("div.bg-clay-50"));
    await close(s);
  },
  async s5(b) {
    const s = await open(b, "s5", BASE + "/#/app/lost", "text=The shopper said");
    await s.at(0.3);
    await click(s.page, nav(s.page, "Fixes"));
    await s.page.waitForSelector("text=Fixes the AI drafted", { timeout: 30000 });
    await s.at(s.sent(0));
    await hl(s.page.locator("text=facts added across").first().locator("xpath=.."));
    await s.at(s.sent(1) - 0.3);
    await hl(s.page.locator("text=facts added across").first().locator("xpath=.."), false);
    await center(s.page.locator(".ag-root-wrapper"));
    await s.at(s.sent(1) + 0.8);
    await hl(s.page.locator('.ag-header-cell:has-text("Quoted from")'));
    await s.at(s.sent(2) - 0.2);
    await hl(s.page.locator('.ag-header-cell:has-text("Quoted from")'), false);
    await s.page.locator("section:has-text('Fixes the AI drafted')").first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" })).catch(() => {});
    await s.at(s.sent(2) + 1);
    await hl(s.page.locator("text=prices, stock levels or promises invented").locator("xpath=.."));
    await close(s);
  },
  async s6(b) {
    const s = await open(b, "s6", BASE + "/#/app/fixes", "text=Fixes the AI drafted");
    await s.at(0.3);
    await click(s.page, nav(s.page, "Overview"));
    await s.page.waitForSelector("text=Your biggest opportunities", { timeout: 30000 });
    await s.at(s.sent(0));
    await center(s.page.locator("section:has-text('Who the AI shoppers chose')").last());
    await s.at(s.sent(1) - 0.2);
    await s.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await s.at(s.sent(1) + 0.4);
    await hl(s.page.locator("p:text-is('PickRate now')").locator("xpath=.."));
    await s.at(s.sent(1) + 3);
    await hl(s.page.locator("p:text-is('PickRate now')").locator("xpath=.."), false);
    await hl(s.page.locator("p:text-is('Sales won back')").locator("xpath=.."));
    await s.at(s.sent(2) - 0.4);
    await hl(s.page.locator("p:text-is('Sales won back')").locator("xpath=.."), false);
    await click(s.page, nav(s.page, "Where you lose"));
    await s.page.waitForSelector("text=The shopper said", { timeout: 30000 });
    await s.at(s.sent(2) + 1.2);
    const toronto = s.page.locator("li:has-text('Toronto')").first();
    await center(toronto);
    await s.at(s.sent(2) + 2.2);
    await hl(toronto);
    await close(s);
  },
  /** Chitti chat, then PayPal checkout, recorded as one continuous take (cut and timed by assemble.mjs). */
  async s7(b) {
    const a = byId.s7a, p = byId.s7b;
    const dir = "build/vid/s7";
    rmSync(dir, { recursive: true, force: true });
    const ctx = await b.newContext({ viewport: VIEW, recordVideo: { dir, size: VIEW } });
    const created = Date.now();
    const page = await ctx.newPage();
    const T = () => (Date.now() - created) / 1000;
    await page.goto(BASE + "/#/app/shopper", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector('input[aria-label="Message to Chitti"]', { timeout: 60000 });
    await overlay(page);
    await sleep(300);
    await syncFlash(page);
    const m = { chatReady: T(), sync0: T() };

    const input = page.locator('input[aria-label="Message to Chitti"]');
    await click(page, input);
    m.typeStart = T();
    await input.pressSequentially("Buy one Monsoon Mug now and check out. Ship to 500 Congress Ave, Austin, TX 78701. I confirm.", { delay: 32 });
    await sleep(400);
    m.send = T();
    await click(page, page.locator('button:has-text("Send")'));
    let link = page.locator('a:has-text("Approve on PayPal")').first();
    try {
      await link.waitFor({ timeout: 100000 });
    } catch {
      // The agent asked a question instead of checking out: confirm once.
      await input.fill("Yes, please check out now.");
      await click(page, page.locator('button:has-text("Send")'));
      link = page.locator('a:has-text("Approve on PayPal")').first();
      await link.waitFor({ timeout: 100000 });
    }
    m.reply = T();
    await sleep(1800);
    await center(page.locator("text=→").first());
    await sleep(2500);
    await link.scrollIntoViewIfNeeded();
    const href = await link.getAttribute("href");
    await point(page, link);
    await sleep(1500);
    m.clickPay = T();
    // Open PayPal in this same tab so one recording covers the whole checkout.
    await page.goto(href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#email", { timeout: 60000 });
    await sleep(800);
    m.paypalLoaded = T();
    await page.locator("#email").pressSequentially(env.SANDBOX_BUYER_EMAIL, { delay: 22 });
    await sleep(300);
    await page.click("#btnNext");
    await page.waitForSelector("#password", { state: "visible", timeout: 30000 });
    await page.locator("#password").pressSequentially(env.SANDBOX_BUYER_PASSWORD, { delay: 40 });
    await sleep(300);
    await page.click("#btnLogin");
    await page.waitForSelector('[data-testid="pay-with"]', { timeout: 60000 });
    await sleep(1500);
    m.review = T();
    await page.click('[data-testid="CC-G4QEAUDQP7QMS-fundingInstrument-container"]');
    await sleep(1800);
    m.card = T();
    await page.click('[data-testid="submit-button-initial"]');
    await page.waitForURL(/\/paypal\/return/, { timeout: 90000 });
    await page.waitForSelector("text=Payment complete", { timeout: 60000 });
    m.returned = T();
    await sleep(2500);
    m.end = T();
    const video = page.video();
    await ctx.close();
    renameSync(await video.path(), "build/vid/s7.webm");
    writeFileSync("build/vid/s7.json", JSON.stringify({ ...m, aDur: a.duration, pDur: p.duration }, null, 2));
    console.log("recorded s7", JSON.stringify(m));
  },
  async s8(b) {
    const s = await open(b, "s8", BASE + "/#/app/proof", "text=Real agent sales");
    await s.at(s.sent(0) - 0.2);
    await center(s.page.locator("text=Real agent sales, attributed through PayPal"));
    await s.at(s.sent(0) + 1.4);
    await s.page.waitForSelector(".ag-row", { timeout: 30000 });
    await hl(s.page.locator(".ag-row").first());
    await s.at(s.sent(1));
    await hl(s.page.locator(".ag-row").first(), false);
    await hl(s.page.locator("dt:has-text('Agent revenue')").locator("xpath=.."));
    await close(s);
  },
  async s9(b) {
    const s = await open(b, "s9", BASE + "/#/", "text=Be the shop AI shopping agents");
    await s.page.setContent(`<!doctype html><meta charset=utf-8><style>
      body{margin:0;height:100vh;display:grid;place-items:center;background:#1f1b16;color:#fff;font-family:Inter,system-ui,sans-serif}
      .w{text-align:center;opacity:0;animation:in 1.2s .2s forwards}@keyframes in{to{opacity:1;transform:none}}
      .w{transform:translateY(14px)} h1{font-size:76px;margin:0;letter-spacing:-1px} h1 b{color:#d9824f}
      h2{font-size:34px;font-weight:600;margin:18px 0 0;color:#f3e6d8} p{font-size:22px;color:#cbbfb3;margin:30px 0 0}
      code{background:#2c2620;padding:6px 14px;border-radius:10px;font-size:24px;color:#fff}</style>
      <div class=w><h1>Chosen<b>One</b></h1><h2>Measure. Fix. Prove.</h2>
      <p>PayPal Orders v2 · Store Sync Cart API · Webhooks · MCP · Gemini · Groq</p>
      <p><code>chosen-one-q4ox.onrender.com</code></p><p>github.com/hanvithSai/chosen-one · MIT</p></div>`);
    await close(s);
  },
};

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ["--hide-scrollbars"] });
mkdirSync("build/vid", { recursive: true });
const order = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];
for (const id of order) {
  if (only.length && !only.includes(id)) continue;
  try {
    await scenes[id](browser);
  } catch (err) {
    console.error(`FAILED ${id}:`, err.message.split("\n")[0]);
    process.exitCode = 1;
  }
}
await browser.close();
