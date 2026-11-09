# ChosenOne: Tasks That Need a Person

These need a person: account sign-ups, CAPTCHAs and 2FA, accepting terms, judgement calls, voice and face, uploads to personal accounts, and final submission. Everything else is done by the AI coding agent ([plan.md](plan.md)).

**Deadline:** Fri 13 Nov, 01:30 IST (Thu 12 Nov, 12:00 PST). Times below are IST.

**Rules:**
- **Free tiers only.** Never add a card or upgrade a plan.
- Keys go **only** in `chosen-one/.env`, copied from `.env.example`. Never paste keys into chat or commit them.
- Use **sandbox** PayPal credentials only.
- When a task is finished, say "H# done".

---

## Done so far
- [x] Picked the name: **ChosenOne**.
- [x] Created the public repo https://github.com/hanvithSai/chosen-one (the AI pushed the first commits).
- [x] Updated the Devpost draft with the new name and elevator pitch.
- [x] Installed the coding-agent plugins: the APIMatic Context Plugin for the PayPal Server SDK, and PayPal's AI-Toolkit.
- [x] Made the stack decisions:
  - LLMs: Gemini and Groq free tiers
  - hosting: Render free with Neon free Postgres
  - planning docs: engineering docs public here; strategy and raw research kept only on the team's machine (not on GitHub)

---

## P0: by Tue 10 Nov, 10:00 (blocks the build)

### H1. Remaining decisions (5 min)
1. **Demo merchant:** **"Fernwood Clay Co.", a fictional pottery studio in Austin, TX**, or another fictional name. Avoid real brands.
2. **Sponsor tools to tick on Devpost:** **APIMatic, Channel3, Render, AG Grid** (we use AG Grid Community for the results grid).
3. **Team roles:** who records the voiceover, and who is the submitting Representative.

### H2. Team and eligibility (10 min)
- [ ] Every member is of age where they live and doesn't live in an excluded place (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, or other OFAC-sanctioned countries).
- [ ] No member is a PayPal, Devpost or sponsor employee, or family of one.
- [ ] Teammates are invited from the Devpost project's team section **and have accepted**.
- [ ] Choose the Representative and agree how any prize is split.

### H3. Research storage (decided)
- [x] Decided that strategy and raw research stay **local only**, in a separate folder on the team's machine. It has its own git history but is never pushed. Nothing to do.

### H4. PayPal Developer sandbox (20 min)
1. Log in at **developer.paypal.com**.
2. Under **Apps & Credentials**, with **Sandbox** selected:
   - **Create App** named "ChosenOne", type **Merchant**.
   - Put the Client ID and Secret in `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
   - In the app's features, make sure **Accept payments**, **Invoicing** and **Transaction search** are ticked.
3. Under **Testing Tools → Sandbox Accounts**:
   - **Business (merchant):** country **US**, currency USD. Put its **Account ID** in `.env` as `PAYPAL_MERCHANT_ID`.
   - **Personal (buyer):** country **US**, with a known password and a balance (for example $5,000). **This login is published in the README for judges.** Use a throwaway password.
   - Put the buyer login in `.env` as `SANDBOX_BUYER_EMAIL` and `SANDBOX_BUYER_PASSWORD`. The AI uses it with Playwright to approve test checkouts.

### H5. Google AI Studio: Gemini free tier (5 min, no card)
- [ ] At https://aistudio.google.com/apikey, sign in and click **Create API key**. Put it in `.env` as `GOOGLE_GENERATIVE_AI_API_KEY`.
- [ ] On AI Studio's **rate limits / usage** page, note the free-tier **RPM, TPM and RPD** for the Flash and Flash-Lite models, and send the numbers to the AI.
- Note: the free tier may use prompts to improve Google's products. We only send synthetic demo data.

### H6. Groq: open models, free tier (5 min, no card)
- [ ] At https://console.groq.com/keys, sign up and create a key. Put it in `.env` as `GROQ_API_KEY`.
- [ ] On **Settings → Limits**, note RPM, RPD, TPM and TPD for `openai/gpt-oss-120b` and `llama-3.3-70b-versatile`, and send them to the AI.

### H7. Channel3 (5 min)
- [ ] At https://trychannel3.com/developers, sign up and apply promo code **`PAYPAL-HACKATHON-2026`** (20,000 free credits). Put the key in `.env` as `CHANNEL3_API_KEY`.

### H8. Neon: free Postgres (5 min, no card)
- [ ] At https://neon.tech, sign up with GitHub (as hanvithSai) on the **Free** plan.
- [ ] Create a project named "chosen-one" in region **AWS US East (Ohio)**, close to Render's Ohio or Virginia regions.
- [ ] Copy the **pooled** connection string (it contains `-pooler`) into `.env` as `DATABASE_URL`.

### H9. Render: free account (3 min, no card)
- [ ] At https://render.com, sign up with GitHub (as hanvithSai) and give it access to the `chosen-one` repo. Stay on the **Free** plan; don't add a payment method.

---

## P1: Tue evening to Wed

### H10. Deploy on Render (Tue about 20:00, 10 min, when the AI says it's ready)
- [ ] In Render, go to **New → Blueprint** and select `chosen-one`. Confirm the instance type is **Free**.
- [ ] Enter the secret values the AI lists (the same as `.env`, plus `PUBLIC_BASE_URL`).
- [ ] Send the AI the service URL. The AI registers the PayPal webhook and runs the live end-to-end test.

### H11. APIMatic free-subscription form (Tue evening, after the PayPal integration lands)
- [ ] Fill in the Google form linked on https://paypalaihackathon.devpost.com/details/apimatic:
  - **Link:** `https://github.com/hanvithSai/chosen-one`
  - **Description:** the AI drafts this from [apimatic-context-plugin.md](apimatic-context-plugin.md).

### H12. Approve test checkouts (only if you didn't share the sandbox buyer login in H4)
- [ ] Open the PayPal sandbox link the AI posts, log in as the sandbox buyer, and approve.

### H13. Product photos (optional, 30 min)
- [ ] Gather 12–24 photos of mugs, bowls, planters and vases: your own, or from Unsplash or Pexels (free licences, no visible logos).
- [ ] Save them in `data/demo/images/` and list their sources in `data/demo/images/CREDITS.md`.

### H14. Review demo content (Wed about 12:00, 20 min)
- [ ] Check that `data/demo/intents.json` (20 shopper requests) reads like real requests people would make.
- [ ] Check that the catalog, merchant notes and UI copy sound like a real small studio.

---

## P2: Thu 12 Nov (submission day)

### H15. Final review (Thu 10:00, 30 min)
- [ ] In an incognito window, follow the README **Judge path** on the hosted URL.
- [ ] Check that every number comes from a recorded run.
- [ ] Check that no competitor brand names or logos appear anywhere.

### H16. Record the video (Thu 11:00–18:00) **[critical]**
- [ ] Use the AI's script and shot list (target 2:45, **under 3:00**).
- [ ] Use free tools: **OBS Studio** to record, **Clipchamp (free)** or **DaVinci Resolve (free)** to edit. Record at 1080p with notifications off.
- [ ] Record the voiceover in your own voice. Add captions. **No copyrighted music.**
- [ ] Show PayPal sandbox order and capture IDs clearly. Cut waiting time.
- [ ] Upload to YouTube as **Public** by **18:00 IST**. Check it while logged out.

### H17. Devpost content (Thu 18:00–21:00)
- [ ] Paste the AI-drafted sections. Built With tags: `paypal`, `paypal-orders-v2`, `paypal-webhooks`, `paypal-transaction-search`, `paypal-mcp`, `agentic-commerce-spec`, `gemini`, `groq`, `vercel-ai-sdk`, `mcp`, `channel3`, `apimatic`, `ag-grid`, `render`, `neon`, `postgresql`, `typescript`, `react`, `node.js`.
- [ ] Add the hosted URL, repo link, YouTube link, screenshots and thumbnail (3:2, under 5 MB).
- [ ] Tick the sponsor tools (H1.2). Add testing instructions: URL, judge path, sandbox buyer login.

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
- [ ] If you win: complete the affidavit and tax forms (W-8BEN for non-US residents) within 10 business days.
