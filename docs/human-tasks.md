# ChosenOne: Tasks That Need the Developer

ChosenOne is a solo project by one developer based in India. Everything below needs that person: account sign-ups, CAPTCHAs and 2FA, accepting terms, judgement calls, voice and face, uploads to personal accounts, and final submission. Everything else is done by the AI coding agent ([plan.md](plan.md)).

**Deadline:** Fri 13 Nov, 01:30 IST (Thu 12 Nov, 12:00 PST). All times below are IST.

**Rules:**
- **Free tiers only.** Never add a card or upgrade a plan.
- Keys go **only** in `chosen-one/.env`, copied from `.env.example`. Never paste keys into chat or commit them.
- Use **sandbox** PayPal credentials only.
- When a task is finished, say "H# done". Task numbers are stable, so there is no H2.

---

## Status at a glance

| Task | Status |
|---|---|
| H1 Decisions | Name, shop and agent persona decided; sponsor tools still to confirm |
| H3 Research storage | Decided: kept on the developer's machine only |
| H4 PayPal sandbox | **Done**: US sandbox app, merchant and buyer; one real payment captured |
| H5 Gemini key | **Done** |
| H6 Groq key | **Done** |
| H7 Channel3 key | **Done** (no promo code needed) |
| H8 Neon database | **Done** |
| H9 Render account | **Done** |
| H10 Deploy | Waiting for the MCP server, webhooks and web UI |
| H11 APIMatic form | **Submitted**; waiting to hear back |
| H12–H20 | Later |

---

## Done so far
- [x] Picked the name: **ChosenOne**.
- [x] Created the public repo https://github.com/hanvithSai/chosen-one.
- [x] Updated the Devpost draft with the new name and elevator pitch.
- [x] Installed the coding-agent plugins: the APIMatic Context Plugin for the PayPal Server SDK, and PayPal's AI-Toolkit.
- [x] Decided the stack: Gemini and Groq free tiers; Render free hosting with Neon free Postgres.
- [x] Decided that engineering docs are public in this repo, while strategy and raw research stay on the developer's machine only.
- [x] Chose the demo shop **Mayabazar** and the in-app buyer agent **Chitti**.
- [x] Created the PayPal sandbox accounts and app, and approved one real test payment (see H4).
- [x] Added the Gemini, Groq and Channel3 keys, and created the Neon project (H5–H8).

---

## P0: blocks the build

### H1. Remaining decisions (5 min)
1. [x] **Demo merchant:** **Mayabazar**, a fictional clay studio in Austin, TX (stoneware, terracotta, raku). The in-app buyer agent is called "Chitti".
2. [ ] **Sponsor tools to tick on Devpost:** recommended **APIMatic, Channel3, Render, AG Grid** (we use AG Grid Community for the results grid). Confirm or change.

### H3. Research storage (decided)
- [x] Strategy and raw research stay **local only**, in a separate folder on the developer's machine. It has its own git history but is never pushed. Nothing to do.

### H4. PayPal Developer sandbox (done)
- [x] **Why US accounts:** Mayabazar is a US shop charging USD. India-based sandbox accounts block PayPal-to-PayPal payments inside India and can leave USD payments pending, so the sandbox merchant and buyer are US accounts even though the developer is in India.
- [x] Created a **US business** account (the merchant) and a **US personal** account (the buyer, with a throwaway password that is published in the README for judges).
- [x] Created the app **ChosenOne US** (type Merchant) on the US business account. Its Client ID and Secret are in `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. The business Account ID is `PAYPAL_MERCHANT_ID`, and the buyer login is `SANDBOX_BUYER_EMAIL` and `SANDBOX_BUYER_PASSWORD`.
- [x] Checkout needs no feature checkbox: the current dashboard has no "Accept payments" option because standard checkout is included in every app.
- [x] A real sandbox payment was created, approved by the developer as the US buyer, and captured.
- [x] **Invoicing** and **Transaction search** are ticked and saved on the app (needed only for the reconciliation badge). The AI re-checks the token scopes before using them.

### H5. Google AI Studio: Gemini free tier (done)
- [x] Key created and stored as `GOOGLE_GENERATIVE_AI_API_KEY`. Verified: the `gemini-flash-latest` and `gemini-flash-lite-latest` models are available.
- The free tier may use prompts to improve Google's products. We only send synthetic demo data.

### H6. Groq: open models, free tier (done)
- [x] Key created and stored as `GROQ_API_KEY`. Measured limits on the free tier: about 1,000 requests a day and 8,000 tokens a minute on `openai/gpt-oss-120b`.

### H7. Channel3 (done)
- [x] Key created and stored as `CHANNEL3_API_KEY`. The signup gave **1,000 free credits a month**, and Channel3's docs describe no promo-code field, so the hackathon promo code was not needed. ChosenOne uses well under 100 searches. If more is ever needed, ask in the `#channel3` channel of the PayPal Discord.

### H8. Neon: free Postgres (done)
- [x] Project **chosen-one** created in **AWS US East (N. Virginia)** under organization `org-purple-frog-89996757`, on the free plan. `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` are in `.env`. Migrations have been applied.
- [x] Restarted the coding agent; the Neon MCP server is loaded and works.

### H9. Render: free account (done)
- [x] Account exists. Stay on the **Free** plan; don't add a payment method. Before H10, make sure Render can access the `chosen-one` repo.

---

## P1: Tue evening to Wed

### H10. Deploy on Render (when the AI says it is ready, 10 min)
- [ ] In Render, go to **New → Blueprint** and select `chosen-one`. Confirm the instance type is **Free**.
- [ ] Enter the secret values the AI lists (the same as `.env`, plus `PUBLIC_BASE_URL`). Copy them from `.env`; never paste them into chat.
- [ ] Send the AI the service URL. The AI registers the PayPal webhook and runs the live end-to-end test.

### H11. APIMatic free-subscription form
- [x] Submitted the Google form linked on https://paypalaihackathon.devpost.com/details/apimatic. Waiting to hear back; the developer passes on any reply.
  - **Claim:** "Participant: APIMatic Basic (1 month)". The winning-team option applies only after winning.
  - **Link:** `https://github.com/hanvithSai/chosen-one`
  - **Description:** the AI drafted this from [apimatic-context-plugin.md](apimatic-context-plugin.md).
- The form only claims the free subscription perk. The sponsor prize itself comes from ticking APIMatic on the Devpost submission (H17).

### H12. Approve test checkouts
- [ ] Browser automation is not connected in this setup, so each live test payment needs the developer to open the PayPal sandbox link the AI posts, log in as the sandbox buyer, and approve. Each takes about 30 seconds.

### H13. Product photos (optional, 30 min)
- [ ] Gather 12–24 photos of stoneware mugs and bowls, terracotta chai cups (kulhads) and planters, and raku vases: your own, or from Unsplash or Pexels (free licences, no visible logos).
- [ ] Save them in `data/demo/images/` and list their sources in `data/demo/images/CREDITS.md`.
- [ ] If skipped, the AI uses clean illustrated cards.

### H14. Review demo content (20 min)
- [ ] Check that `data/demo/intents.json` (20 shopper requests) reads like real requests people would make.
- [ ] Check that the catalog, merchant notes and UI copy sound like a real small studio.

---

## P2: Thu 12 Nov (submission day)

### H15. Final review (Thu, about 10:00, 30 min)
- [ ] In an incognito window, follow the README **Judge path** on the hosted URL.
- [ ] Check that every number comes from a recorded run.
- [ ] Check that no competitor brand names or logos appear anywhere.

### H16. Record the video (Thu 11:00–18:00) **[critical]**
- [ ] Use the AI's script and shot list (target 2:45, **under 3:00**).
- [ ] Use free tools: **OBS Studio** to record, **Clipchamp (free)** or **DaVinci Resolve (free)** to edit. Record at 1080p with notifications off.
- [ ] Record the voiceover in your own voice (an AI voiceover is also allowed). Add captions. **No copyrighted music.**
- [ ] Show PayPal sandbox order and capture IDs clearly. Cut waiting time.
- [ ] Upload to YouTube as **Public** by **18:00 IST**, because processing can take hours. Check it while logged out.

### H17. Devpost content (Thu 18:00–21:00)
- [ ] Paste the AI-drafted sections. Built With tags: `paypal`, `paypal-orders-v2`, `paypal-webhooks`, `paypal-transaction-search`, `paypal-mcp`, `agentic-commerce-spec`, `gemini`, `groq`, `vercel-ai-sdk`, `mcp`, `channel3`, `apimatic`, `ag-grid`, `render`, `neon`, `postgresql`, `typescript`, `react`, `node.js`.
- [ ] Add the hosted URL, repo link, YouTube link, screenshots and thumbnail (3:2, under 5 MB).
- [ ] Tick the sponsor tools (H1.2). Add testing instructions: URL, judge path, sandbox buyer login.
- [ ] Submit as an individual.

### H18. GitHub repo settings (5 min)
- [ ] In the About box, add the description, website (the hosted URL) and topics: `paypal`, `agentic-commerce`, `mcp`, `ai-agents`, `hackathon`.
- [ ] Check the license shows as MIT and the repo is Public.

### H19. Submit (by 22:00 IST; hard deadline Fri 01:30 IST)
- [ ] Submit on Devpost and confirm the status isn't "Draft".

---

## After submission (until about 21 Dec)

### H20. Freeze and keep alive
- [ ] **Don't change** the repo, video or Devpost entry after Fri 01:30 IST.
- [ ] Keep these active:
  - the Render service
  - the Neon project
  - the PayPal sandbox app and accounts
  - the Gemini, Groq and Channel3 keys
  - the GitHub keep-alive workflow (don't disable it)
- [ ] Watch your email for questions during judging (1–15 Dec).
- [ ] If you win: the rules say residents of other countries may be asked for a W-8BEN form, plus a winner affidavit, within 10 business days. Check your own tax obligations in India.
