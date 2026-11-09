# ChosenOne

**When an AI shops for you, it picks one store. ChosenOne helps small shops be that store.**

AI agents are becoming shoppers, and a small merchant can't see whether those agents recommend them. ChosenOne shows small PayPal merchants three things:

- their **PickRate**, which is how often AI shopping agents choose their store
- why agents choose someone else
- how much revenue agents bring in

It then fixes the gaps with AI and attributes every agent sale through PayPal.

> 🚧 **In active development for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (submissions close 12 Nov 2026).** This README is filled in as features land.

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
- **AI:** an LLM with tool calling and structured outputs. The provider is being finalised; only open-source and free-tier options are used.
- **Sponsor tools:**
  - APIMatic Context Plugin for PayPal
  - Channel3
  - AG Grid
  - Render

### Built with the APIMatic Context Plugin and the PayPal AI-Toolkit

We built the PayPal integration with an AI coding agent that had two plugins installed:

- the **[APIMatic Context Plugin for the PayPal Server SDK](https://github.com/paypaldev/server-sdk-context-plugin-preview)**, `paypal@context-plugins-local` v0.1.0. It provides TypeScript skills for client setup, authentication, calling endpoints, models, error handling and testing.
- the **[PayPal AI-Toolkit](https://github.com/paypal/AI-Toolkit)**, plugin v1.2.0. It provides `paypal-best-practices`, `setup`, `doctor`, `sandbox` and other skills.

Details of which skills shaped which files are in [docs/apimatic-context-plugin.md](docs/apimatic-context-plugin.md).

## License

[MIT](LICENSE)
