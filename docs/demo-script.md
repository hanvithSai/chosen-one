# Demo video: script and shot list

**Target length 2:45, hard limit under 3:00.** Record at 1080p with notifications off, using the hosted site (https://chosen-one-q4ox.onrender.com) in a normal browser window. Use free tools only: OBS Studio to record, Clipchamp (free) or DaVinci Resolve (free) to edit. Add captions. No copyrighted music.

The video must show **PayPal and AI working end to end**. Keep the voiceover plain and specific. Say what is simulated.

**Before recording**
- Open the site once so it is awake. Open the PayPal sandbox buyer login in a second tab and stay logged out.
- Have the README judge-path buyer login ready.
- Do one dry run of the Chitti checkout so you know the timing. Choose **PayPal balance or card**, not the bank account.
- Cut waiting time (model replies take 10 to 30 seconds).

## Script

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:15 | The landing page, then click **Open the demo** to the Overview (15% → 60%) | "When an AI shops for you, it picks one store. A small shop can't see whether those agents pick them. ChosenOne is a Search Console for AI shopping agents, built on PayPal." |
| 0:15–0:40 | **Overview** and **Where you lose**: the setup checklist, the "who the shoppers chose" bars, and one lost-sale card with the shopper's reason and suggested action | "This is Mayabazar, a fictional clay studio with thin product listings. Twenty AI shoppers compared it with anonymised competitor listings. They chose Mayabazar in 15% of requests. The top reason: a fact they needed, like dishwasher safe or delivery time, wasn't stated." |
| 0:40–0:55 | **Shopper results**: scroll the 20-request grid | "Each decision is a real model run, recorded, with its reasoning. This is a simulated panel of 20 requests, so we treat it as a method demo, not a benchmark." |
| 0:55–1:20 | **Fixes** page: filter to one product, show a fact and its quote | "The AI drafted 267 facts from the shop's own notes. Every fact has to quote a note, and the code checks the quote exists and the numbers match. Prices and stock are never touched. The merchant approves, and a new catalog version is published." |
| 1:20–1:40 | **Where you lose → Recovered by the fixes**, then **Before vs after** top: 15% → 60% | "Same 20 requests, same market, after the approved fixes: 60%. Ten sales won back and one lost, shown honestly." |
| 1:40–2:25 | **Try as a shopper**: send the mug request, show tool steps, click **Approve on PayPal**, log in, approve, land on the "Payment complete" page | "Now a real agent. Chitti uses the store's own MCP server, like any outside agent: it searches, reads product facts and policies, builds a cart priced by the store, and starts a PayPal Orders checkout. I approve the payment on PayPal's sandbox." |
| 2:25–2:45 | **Before vs after** page: the order row with agent `chitti`, capture id, webhook **verified** | "The sale is captured and attributed to the agent in PayPal's custom_id. A verified webhook confirms it. That's the loop: measure, fix, prove." |
| 2:45–2:55 | Architecture slide or the Connect tab | "Built with PayPal Orders v2, the Store Sync Cart API and webhooks, an MCP server, Gemini and Groq on free tiers, and the APIMatic Context Plugin for the PayPal SDK. Open source, MIT." |

## Shot checklist

- [ ] Hero numbers visible and readable (zoom the browser to 110%)
- [ ] The word "simulated" is said once, clearly
- [ ] A fact and its source quote on screen together (Fixes page)
- [ ] Chitti's tool steps visible (`search_products`, `get_product`, `create_cart`, `checkout_cart`)
- [ ] PayPal sandbox page visible, buyer approving, "Payment complete" page with order and capture IDs
- [ ] Before vs after page: agent `chitti`, COMPLETED, webhook verified
- [ ] No keys or `.env` on screen; the buyer login shown is the public sandbox one
- [ ] Captions on; no music with copyright

## If something goes wrong while recording

- Chitti says it is busy: wait a minute and retry, or use the **Connect agents** page and show a `curl` to `/merchant-cart` instead.
- PayPal shows `PENDING`: you paid from the bank account; redo with PayPal balance or the card.
- The site is slow: open `/healthz` first to wake it.
