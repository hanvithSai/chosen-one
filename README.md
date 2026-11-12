# ChosenOne

**When an AI shops for you, it picks one store. ChosenOne helps small shops be that store.**

AI agents are becoming shoppers, and a small merchant can't see whether those agents recommend them. ChosenOne is a Search Console for AI shopping agents. For a small PayPal merchant it shows:

- their **PickRate**: how often AI shopping agents choose their store
- why agents choose someone else
- how much revenue agents bring in

It then fixes the gaps with AI, and proves the result with real agent checkouts attributed through PayPal.

**Live demo:** https://chosen-one-q4ox.onrender.com &nbsp;·&nbsp; Built solo for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

> The demo shop, **Mayabazar**, is a fictional clay studio in Austin, TX. Payments use the PayPal **sandbox**, so no real money moves. The free hosting can take up to a minute to wake the first time you open it.

## Result: PickRate 15% → 60%

On the demo shop, 20 AI shopper requests were run twice against the same competitor market: once with the shop's thin listings, once after the shop approved AI-drafted fixes.

| | Before fixes | After approved fixes |
|---|---|---|
| **PickRate** (AI shoppers who chose Mayabazar) | **15%** (3 of 20) | **60%** (12 of 20) |
| Most common reason for losing | A fact the shopper needed was not stated (22 mentions) | Still missing facts on 8 mentions |

The fixes added 267 facts across 24 listings (dishwasher safe, size, delivery time, returns, gift wrap and so on). Every fact quotes the merchant's own notes, and the code checks that the quote exists and that every number in the fact appears in it. Prices, stock and promises are never invented. One request was won before and lost after; the dashboard shows it.

**How to read this number.** It is a *simulated* panel of 20 requests, one run each, using free-tier models (Gemini and Groq). The requests were written to match the facts in the demo shop's notes. It shows the method working end to end; it is not a benchmark of how any specific shopping assistant ranks real stores. The two runs are recorded and shipped with the repo, so every number in the dashboard comes from a stored run.

## Judge path (5 minutes)

1. **Open the live demo.** The landing page explains the product; click **Open the demo** to enter the merchant app. The **Overview** shows the setup checklist and PickRate 15% → 60%.
2. **Where you lose:** every shopper request the shop did not win, with what the shopper said and a suggested action. Tabs show what is still lost, what the fixes recovered, and what was lost before.
3. **Shopper results:** all 20 requests, before and after, and who won the sales instead (competitors are anonymised).
4. **Fixes:** the 267 facts the AI drafted, each with the quote from the shop's own notes that supports it.
5. **Before vs after:** the sales won back, and the real agent orders attributed through PayPal.
6. **Try as a shopper.** Chitti is an AI buyer that uses the store's own MCP server. Ask it for a mug under $40 delivered to Austin, TX 78701, then tell it to check out. Click **Approve on PayPal (sandbox)** and log in as the sandbox buyer:

   | | |
   |---|---|
   | Email | `sb-a55ct53836734@personal.example.com` |
   | Password | `d&!63'yS` |

   On PayPal's page choose **PayPal balance** or the **card** as the payment method. (A payment from the linked bank account stays `PENDING`, which the sandbox never clears.)
7. **Back in the app**, open **Before vs after**: the order appears with its PayPal order and capture IDs, the agent (`chitti`) credited, and the webhook marked **verified**.
8. **Bring your own agent (optional).** The **Connect agents** page shows the MCP URL and tools. The bearer token for this sandbox demo is `chosenone-demo-2026`.

Chitti runs on free-tier AI models and is limited to 8 chats per visitor per hour and 150 a day. If it says it is busy, try later or use your own agent.

## How it works

1. **Measure.** A panel of AI "mystery shoppers" works through 20 realistic requests. For each request a deterministic search finds up to 8 listings from Mayabazar and from a snapshot of anonymised competitor products (from the Channel3 API), and a model decides which one to buy, or none, and why. ChosenOne reports **PickRate** and the reasons it lost.
2. **Fix.** An LLM drafts structured catalog facts from the merchant's own notes. Each cites a quote from a note. The merchant approves, and the approved facts become a new catalog version. Nothing else about a product changes.
3. **Prove.** The store is published through PayPal's Store Sync **Cart API v1** contract (`@paypal/agentic-commerce-spec`) and an **MCP server**. When an agent buys, checkout runs on **PayPal Orders v2**: the shopper approves on PayPal, the sale is captured and attributed to the agent in the payment's `custom_id`, and a **verified webhook** confirms it.

Architecture, data model and flows are in [docs/architecture.md](docs/architecture.md).

## PayPal APIs used

| API | How |
|---|---|
| **Store Sync Cart API v1** (`@paypal/agentic-commerce-spec` 1.1.0) | `POST /merchant-cart`, `GET` and `PUT /merchant-cart/{id}`, `POST /merchant-cart/{id}/checkout`. Requests and responses are validated with the spec's own Zod schemas; all prices, shipping and delivery dates are computed by the store. |
| **Orders v2** (`@paypal/paypal-server-sdk` 2.5.0) | Create (`intent: CAPTURE`) with `custom_id = agent=<client>;cart=<id>` and `invoice_id`; approve on PayPal; capture on return. |
| **Webhooks** | `POST /webhooks/paypal` verifies each delivery with PayPal's `verify-webhook-signature` using the exact raw body, stores events idempotently, and marks orders confirmed. `npm run webhook:register` registers the endpoint. |

### PayPal integration best practices

| Practice | Where |
|---|---|
| `PayPal-Request-Id` idempotency on order creation and capture | `server/payments/paypalGateway.ts` |
| Orders created server-side only; amounts computed by the store | `server/commerce/cart.ts`, `cartPricing.ts` |
| Webhook signature verification, raw body preserved, idempotent ledger | `server/webhooks/` |
| Handle `INSTRUMENT_DECLINED` and `ORDER_ALREADY_CAPTURED` | `paypalGateway.ts` |
| Retry 429 and 5xx with backoff, honouring `Retry-After` (the SDK does not retry POST by default) | `withRetry` in `paypalGateway.ts` |
| Log `debug_id`; return it in 502 errors | `paypalErrors.ts`, `cartRoutes.ts` |
| Honest status for `PENDING` captures instead of calling them complete | `paymentRoutes.ts`, dashboard |
| Sandbox only; the server refuses to start with production settings | `server/payments/createGateway.ts` |

## AI used

- **Models:** Google **Gemini** and open models served by **Groq**, both on free tiers, through the open-source **Vercel AI SDK**. A quota guard keeps each provider inside its free limits and falls back to the other when one is busy.
- **Structured outputs** for shopper decisions and for fix proposals (validated with Zod).
- **MCP server** (`@modelcontextprotocol/sdk`, streamable HTTP) so any outside agent can search, build a cart and check out.
- **MCP client** (`@ai-sdk/mcp`) and tool calling in **Chitti**, the in-app buyer agent, which shops through the store's own `/mcp` endpoint exactly as an outside agent would.

## Built with the APIMatic Context Plugin and the PayPal AI-Toolkit

The PayPal integration was written by an AI coding agent that had two plugins installed:

- the **[APIMatic Context Plugin for the PayPal Server SDK](https://github.com/paypaldev/server-sdk-context-plugin-preview)** (`paypal@context-plugins-local` v0.1.0), which gives the agent accurate knowledge of the generated SDK: client setup, authentication, endpoints, models and errors
- the **[PayPal AI-Toolkit](https://github.com/paypal/AI-Toolkit)** (plugin v1.2.0), for PayPal best-practices guidance

[docs/apimatic-context-plugin.md](docs/apimatic-context-plugin.md) lists which skills shaped which files, and the SDK defaults they surfaced (no retries by default, never on POST).

## Built with

- **PayPal:** Orders v2 (Server SDK), Store Sync Cart API v1 (spec package), Webhooks
- **AI:** Gemini and Groq (free tiers) via the Vercel AI SDK; Model Context Protocol server and client
- **Sponsor tools:** APIMatic Context Plugin, Channel3, AG Grid Community, Render
- **Infrastructure (free tier or open source):** Node.js 22 and TypeScript, Express 5, React 19, Vite, Tailwind CSS 4, Postgres on Neon (PGlite locally and in tests) with Drizzle ORM, GitHub Actions

## Run locally

Requires Node 22. No database to install: without `DATABASE_URL` the app uses an embedded Postgres (PGlite) and seeds the Mayabazar demo, the competitor snapshot and the recorded run on start.

```bash
npm install
cp .env.example .env     # optional: add keys (see below)
npm run dev              # API on :3000, web app on :5173
npm test                 # unit and integration tests
```

- **Without any keys** the dashboard, the recorded results, the Cart API and the MCP server all work. Payments use an offline gateway.
- **With PayPal sandbox keys** in `.env`, checkout creates real sandbox orders.
- **With a Gemini or Groq key**, Chitti and live panel runs work. Set `DEMO_MODE=live` (the default locally) to allow starting new panels with the admin token.
- The server refuses to start with production PayPal settings.

Try the Cart API. The bearer token is `STORE_API_TOKEN` from your `.env` (`change-me` in the template, or `local-dev-store-token` with no `.env`):

```bash
curl -X POST localhost:3000/merchant-cart \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"item_id":"MB-MUG-MONSOON","quantity":1}],"shipping_address":{"country_code":"US","postal_code":"78701"}}'
```

Useful scripts: `npm run panel:run` (run the shopper panel), `npm run fixes:run` (draft, approve and re-measure), `npm run market:snapshot` (refresh competitor data, uses Channel3 credits), `npm run webhook:register`, `npm run smoke` (boot the production build).

## Limitations

- The shopper panel is **simulated**: 20 requests, one run each, free-tier models. It is not how any specific commercial assistant ranks stores, and results vary between runs.
- The demo requests were written to match the facts in the demo shop's notes, so the improvement shows the method, not a market-wide effect.
- Competitor data is a one-time Channel3 snapshot (37 listings, 12 sellers, anonymised); it does not update.
- The bearer token on the Cart API and MCP server stands in for PayPal's Store Sync JWT; ChosenOne is not enrolled in Store Sync.
- Payments are PayPal **sandbox** only. Bank-funded sandbox payments stay `PENDING`.
- Free-tier hosting and AI quotas: the first page load can be slow, and Chitti can report that it is busy.
- Not built: Transaction Search reconciliation, a merchant copilot, and a public store page.

## Project docs

- [Architecture](docs/architecture.md): components, data model, flows
- [Engineering plan](docs/plan.md): scope, schedule, testing, risks, and what changed
- [Deployment](docs/deployment.md): Render and Neon, step by step
- [APIMatic Context Plugin notes](docs/apimatic-context-plugin.md)
- [Demo video script](docs/demo-script.md) and [Devpost text](docs/devpost.md)
- [Tasks that need the developer](docs/human-tasks.md)

## License

[MIT](LICENSE)
