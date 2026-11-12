# Devpost submission text

Copy each section into the matching Devpost field. Edit freely; every claim below matches the repo and the live demo.

**Project name:** ChosenOne: be the shop AI shopping agents pick

**Elevator pitch (one line):** When an AI shops for you, it picks one store. ChosenOne helps small shops be that store.

**Links**
- Live demo: https://chosen-one-q4ox.onrender.com
- Code: https://github.com/hanvithSai/chosen-one
- Video: add the public YouTube link after upload

---

## Inspiration

AI assistants are starting to shop on people's behalf, and they usually pick one store. A small merchant has no way to see whether those agents recommend them, why they lose, or whether an agent sale came from an AI at all. Big retailers can build teams for this. A small PayPal merchant cannot. We wanted a Search Console for AI shopping agents.

## What it does

ChosenOne shows a small PayPal merchant three things: their **PickRate** (how often AI shopping agents choose their store), why agents choose someone else, and how much revenue agents bring in. Then it fixes the gaps and proves the result.

- **Measure.** A panel of AI shoppers works through 20 realistic requests, comparing the demo shop (Mayabazar, a fictional clay studio) with anonymised competitor listings. It reports PickRate, who won the sales it lost, and the reasons.
- **Fix.** An LLM drafts missing facts (care, size, delivery time, returns) from the merchant's own notes. Every fact must quote a note, and the code verifies the quote and the numbers. The merchant approves, and a new catalog version is published. Prices and stock are never changed.
- **Prove.** The store speaks MCP and PayPal's Store Sync Cart API, so a real agent can search, build a cart and check out. Checkout runs on PayPal Orders v2; the sale is captured, attributed to the agent in `custom_id`, and confirmed by a verified webhook.

On the demo shop, PickRate went from **15% to 60%** across the same 20 requests after the approved fixes. This is a simulated panel (one run per request, free-tier models), so we present it as a demonstration of the method, not a benchmark.

## How we built it

- **PayPal:** Orders v2 through the Server SDK (idempotency keys, retries with backoff, decline and capture handling, `debug_id` logging), the Store Sync Cart API v1 contract through `@paypal/agentic-commerce-spec` (validated with its own schemas, all prices computed server-side), and webhooks verified with PayPal's `verify-webhook-signature` against the exact raw body.
- **AI:** Gemini and Groq free tiers through the Vercel AI SDK, with a quota guard and provider fallback. Structured outputs for shopper decisions and fix proposals. An MCP server for outside agents, and **Chitti**, an in-app buyer agent that uses the store's own MCP endpoint through an MCP client with tool calling.
- **Stack:** Node 22 and TypeScript, Express 5, React 19, Tailwind 4, AG Grid Community, Postgres on Neon (PGlite for local and tests) with Drizzle, hosted on Render's free tier, CI on GitHub Actions.
- **Built with an AI coding agent using the APIMatic Context Plugin for the PayPal Server SDK and PayPal's AI-Toolkit**, which gave it accurate SDK knowledge (for example that the SDK never retries POST, so we retry safely ourselves with one request id).

## Challenges we ran into

- The Server SDK retries nothing by default and never retries POST, so payment retries had to be designed deliberately around `PayPal-Request-Id`.
- PayPal's Cart API spec package could not be loaded by plain Node at runtime. We isolated it behind one adapter, added a lint rule, and made CI boot the production build.
- Free-tier model limits: Groq allows about 8,000 tokens a minute, so the panel is one structured call per request, paced by a quota guard, with fallback to Gemini when a provider is busy.
- Making fixes trustworthy: a model can invent facts, so each one must quote the merchant's notes and pass a code check.
- A sandbox payment funded from a bank account stays `PENDING` (`ECHECK`). We made the UI say "clearing" instead of "complete".

## Accomplishments that we're proud of

- A complete loop that is real end to end: an AI agent searches, builds a cart and checks out, a human approves on PayPal, the payment is captured, attributed to the agent, and confirmed by a verified webhook, all live on the hosted demo.
- Fixes that cannot invent facts: every added fact carries a quote from the merchant's own notes, verified by code.
- Every number in the dashboard comes from a stored run; the recorded runs ship with the repo.
- All of it runs on free tiers and open source.

## What we learned

Agents reject listings that do not state what a shopper needs, even when the shop has the facts in its own notes. The gap between what a merchant knows and what their listing says is large, measurable, and cheap to close. We also learned how much careful payment plumbing (idempotency, retries, webhook verification, honest status handling) matters when an agent, not a person, is the one checking out.

## What's next

Reconcile agent sales with PayPal Transaction Search, add a merchant copilot over PayPal's MCP server, publish a public store page with structured data, and move from a simulated panel to measuring real assistants as access allows.

## Built with

Devpost accepts single-word tags only. As entered (24): `paypal`, `mcp`, `gemini`, `groq`, `apimatic`, `channel3`, `aggrid`, `render`, `neon`, `postgresql`, `typescript`, `react`, `nodejs`, `webhooks`, `agentic-commerce`, `ai-sdk`, `drizzle`, `express`, `vite`, `tailwindcss`, `zod`, `github-actions`, `llm`, `paypal-sandbox`.

## Sponsor tools to tick

APIMatic (Context Plugin for the PayPal Server SDK), Channel3 (competitor product search), Render (hosting), AG Grid (Community edition, results grids). Tick only what the Devpost form lists; all four are used in the project.

## Testing instructions (for the judges' field)

1. Open https://chosen-one-q4ox.onrender.com (the first load can take up to a minute while the free host wakes).
2. Click **Open the demo**, then look at **Overview**, **Where you lose**, **Fixes** and **Before vs after**: PickRate 15% → 60% from recorded runs.
3. Open **Try as a shopper**, ask for a mug under $40 delivered to Austin, TX 78701, then say to check out. Click **Approve on PayPal (sandbox)**.
4. Log in with the sandbox buyer from the README: email `sb-a55ct53836734@personal.example.com`, password `d&!63'yS`. Choose **PayPal balance or the card** (not the bank account).
5. Return to the dashboard, open **Before vs after**: the order shows agent `chitti`, COMPLETED, and the webhook as verified.
6. Optional: connect your own agent with the MCP URL on the **Connect agents** page; the bearer token for this sandbox demo is `chosenone-demo-2026`.

Payments are PayPal sandbox only; no real money moves.

## Gallery images (7, as submitted, each caption under 140 characters)

Files are in `video/out/images/` (3:2 PNGs, regenerate with `node video/images.mjs`).

1. Landing page: ChosenOne shows small PayPal shops how often AI shopping agents pick them. Demo shop PickRate: 15% to 60%.
2. Overview: setup checklist, PickRate 15% to 60%, ten sales won back, and the biggest opportunities grouped by what to fix.
3. Where you lose: each lost sale shows the shopper's request, their reason in their own words, and a suggested action.
4. Fixes: 267 AI-drafted facts, each quoting the merchant's own notes. Code checks every quote and number before approval.
5. Before vs after: the same 20 AI shoppers, run again. PickRate rises from 15% to 60%; ten sales won back, one lost.
6. Real agent sales via PayPal: agent name, order and capture IDs, and a verified webhook confirmation (sandbox).
7. Connect agents: any AI agent can shop through the MCP server or Store Sync Cart API, then pay with PayPal Orders v2.

## Video

https://youtu.be/_bHwkebw4SA (2:52, public). Title: "ChosenOne: be the shop AI shopping agents pick | PayPal AI Hackathon 2026". The description has chapter timestamps and an honest-limits note. See [video/README.md](../video/README.md) for how it was made.

## Other form answers (as drafted)

**Technology requirement.** PayPal (free sandbox only): Orders v2 through `@paypal/paypal-server-sdk` 2.5.0 (create with a `PayPal-Request-Id`, `custom_id` carrying the agent name, approve, capture, safe retries), the Store Sync Cart API v1 through `@paypal/agentic-commerce-spec` 1.1.0 (validated with the spec's own schemas, all prices computed by the store), PayPal Webhooks (verified with `verify-webhook-signature` against the raw body, idempotent ledger), and sandbox accounts with OAuth client credentials. AI: Gemini and Groq's `openai/gpt-oss-120b` on free tiers through the Vercel AI SDK, powering AI shoppers, fix drafting (every fact must quote the merchant's notes) and Chitti, a buyer agent that uses an MCP client with tool calling against the store's own MCP server; plus the MCP server for outside agents.

**AI tools used.** To build: an AI coding agent in the IDE, with the APIMatic Context Plugin for the PayPal Server SDK, PayPal's AI-Toolkit and the Neon MCP server. Inside the product: Gemini, Groq, the Vercel AI SDK, an MCP server and an MCP client. The demo narration used Piper, an open-source text-to-speech voice.

**APIMatic Context Plugin experience.** Used five TypeScript skills (getting-started, client-initialization, authentication, calling-endpoints, error-handling). It gave accurate SDK 2.5.0 knowledge: the client is one long-lived object, retries are off by default and never apply to POST (so retries were built around one `PayPal-Request-Id`), and error payloads keep PayPal's snake_case names. Issues: a preview release installed through an npx command, only five skills used, and it covers the Server SDK only (the Cart API package and webhook verification were done from PayPal's REST docs). No measured time saving, because the same thing was not built twice. Details: [apimatic-context-plugin.md](apimatic-context-plugin.md).

**AG Grid experience.** AG Grid Community 36.x (not AG Charts or AG Studio) for three tables: shopper results, 267 fixes and agent orders. Sorting, filtering and resizing came for free, `themeQuartz.withParams` matched the brand, and React cell renderers gave status chips. Issues: auto-height rows needed explicit line height and padding, and the grid makes one JavaScript chunk over 500 kB (not code-split).

**Sponsor tools used.** APIMatic, Channel3, AG Grid and Render.

**Overall experience feedback.** Strong theme and useful sponsor tooling. Suggestions: note that sandbox accounts created in India block PayPal-to-PayPal payments, clarify that the Channel3 perk has no promo-code field, show the Pacific-time deadline in local time, and collect sponsor perk claims in one checklist.
