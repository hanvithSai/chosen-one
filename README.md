# ChosenOne

**When an AI shops for you, it picks one store. ChosenOne helps small shops be that store.**

AI agents are becoming shoppers, and a small merchant can't see whether those agents recommend them. ChosenOne shows small PayPal merchants three things:

- their **PickRate**, which is how often AI shopping agents choose their store
- why agents choose someone else
- how much revenue agents bring in

It then fixes the gaps with AI and attributes every agent sale through PayPal.

> 🚧 **Built solo for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (submissions close 12 Nov 2026) and still in active development.** This README is filled in as features land.

## How it works

1. **Measure.** A panel of AI "mystery shopper" agents (LLM agents with tools) works through realistic shopping requests. They shop the merchant's store alongside competitor products from the Channel3 API. ChosenOne reports the store's **PickRate** and the agent's stated reason for every lost sale.
2. **Fix.** An LLM drafts structured catalog fixes, such as care instructions, dimensions, delivery windows and returns. Each fix cites the merchant's own notes. The merchant approves every change. Prices and stock are never invented.
3. **Prove.** The store is published through PayPal's Store Sync **Cart API v1** contract (`@paypal/agentic-commerce-spec`) and an **MCP server**. When a real AI agent buys, checkout runs on **PayPal Orders v2**: the shopper approves on PayPal, and the sale is captured and attributed to the agent. That attribution is confirmed by verified **PayPal webhooks** and reconciled with **Transaction Search**.

## Built with

- **PayPal:**
  - Orders v2 through `@paypal/paypal-server-sdk`
  - Store Sync Cart API v1 spec (`@paypal/agentic-commerce-spec`)
  - Webhooks
  - Transaction Search
  - Agent Toolkit / PayPal MCP server
- **AI:**
  - Google **Gemini** (free tier) and open-source models served by **Groq** (free tier), through the open-source **Vercel AI SDK**.
  - Uses tool calling, structured outputs and an MCP client.
- **Sponsor tools:**
  - APIMatic Context Plugin for PayPal
  - Channel3
  - AG Grid Community
  - Render
- **Infrastructure (all free tier or open source):**
  - Node.js / TypeScript, Express, React + Vite
  - Postgres (Neon free tier; PGlite locally) with Drizzle ORM
  - Model Context Protocol SDK
  - GitHub Actions

### Built with the APIMatic Context Plugin and the PayPal AI-Toolkit

We built the PayPal integration with an AI coding agent that had two plugins installed:

- the **[APIMatic Context Plugin for the PayPal Server SDK](https://github.com/paypaldev/server-sdk-context-plugin-preview)**, `paypal@context-plugins-local` v0.1.0. It provides TypeScript skills for client setup, authentication, calling endpoints, models, error handling and testing.
- the **[PayPal AI-Toolkit](https://github.com/paypal/AI-Toolkit)**, plugin v1.2.0. It provides `paypal-best-practices`, `setup`, `doctor`, `sandbox` and other skills.

Details of which skills shaped which files are in [docs/apimatic-context-plugin.md](docs/apimatic-context-plugin.md).

## Status

**Working today** (all in CI):
- Mayabazar, a fictional demo clay shop with 24 deliberately thin listings, 8 merchant notes and 20 shopper requests
- deterministic product search over the shop's catalog
- the Store Sync **Cart API v1** (`/merchant-cart`), validated against PayPal's own schemas, with all prices computed on the server
- real **PayPal Orders v2** checkout through the Server SDK in the sandbox, with idempotency keys, retries and `debug_id` logging; the shopper approves on PayPal and the payment is captured and attributed to the calling agent

**In progress:** MCP server for outside agents, verified PayPal webhooks, the AI shopper panel (Gemini and Groq free tiers), the competitor market from Channel3, and the dashboard.

## Run locally

Requires Node 22. No database to install: without `DATABASE_URL` the app uses an embedded Postgres (PGlite) and seeds the Mayabazar demo store on start.

```bash
npm install
cp .env.example .env     # optional: add PayPal sandbox keys to use real PayPal checkout
npm run dev              # API on :3000, web app on :5173
npm test                 # unit and integration tests
```

Without PayPal credentials the app uses an offline payment gateway, so the whole flow still runs. With sandbox credentials in `.env` it creates real sandbox orders. The server refuses to start with production PayPal settings.

Try the Cart API. The bearer token is `STORE_API_TOKEN` from your `.env` (`change-me` in the template, or `local-dev-store-token` if you have no `.env`):

```bash
curl -X POST localhost:3000/merchant-cart \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"item_id":"MB-MUG-MONSOON","quantity":1}],"shipping_address":{"country_code":"US","postal_code":"78701"}}'
```

## Project docs

- [Engineering plan](docs/plan.md): architecture, scope, schedule, testing and risks
- [Tasks that need the developer](docs/human-tasks.md)

## License

[MIT](LICENSE)
