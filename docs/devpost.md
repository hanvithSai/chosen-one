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

`paypal`, `paypal-orders-v2`, `paypal-webhooks`, `agentic-commerce-spec`, `gemini`, `groq`, `vercel-ai-sdk`, `mcp`, `channel3`, `apimatic`, `ag-grid`, `render`, `neon`, `postgresql`, `typescript`, `react`, `node.js`

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

## Screenshots to upload (5, with captions)

1. Dashboard hero, "PickRate 15% to 60%"
2. Overview, setup checklist and who the shoppers chose
3. Where you lose, a lost sale with the shopper's reason and suggested action
4. Fixes, a fact next to its source quote
5. Try as a shopper, tool steps and the Approve on PayPal button (and Before vs after, agent order with capture id and verified webhook)

Thumbnail (3:2, under 5 MB): the hero numbers on the dark card.
