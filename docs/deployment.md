# Deploying ChosenOne on Render (free)

ChosenOne runs as one free Render web service. The database is the free Neon Postgres project, so
the service itself holds no data. Everything is defined in [render.yaml](../render.yaml).

## What the service does when it starts

1. Connects to Neon with `DATABASE_URL` and applies migrations.
2. Seeds the demo shop, the competitor snapshot and the recorded demo results. This is
   idempotent: the first start takes about 30 seconds, later starts skip it.
3. Serves the dashboard, the Cart API, the MCP server and the webhook receiver on one port.

`DEMO_MODE=replay` makes the public site read-only: nobody can start new shopper panels or change
the catalog, so visitors cannot use up the free AI quota. Chitti, the chat buyer agent, stays on
and is rate limited (8 chats per visitor per hour, 150 per day).

## Environment variables

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (in `.env`) |
| `STORE_API_TOKEN` | Any string of 8+ characters. It is the bearer token for the Cart API and MCP server, and is published in the README so judges can try them. Sandbox only. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal sandbox app (in `.env`) |
| `PAYPAL_WEBHOOK_ID` | Printed by `npm run webhook:register` after the first deploy |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` | Free-tier keys (in `.env`), used by Chitti |
| `PUBLIC_BASE_URL` | Not needed. Render's own `RENDER_EXTERNAL_URL` is used. |

Never paste these values into chat or commit them.

## Deploy steps

1. In Render, choose **New → Blueprint**, pick the `chosen-one` repository, and confirm the
   instance type is **Free**.
2. Fill in the secret values from the table. Leave `PAYPAL_WEBHOOK_ID` empty for now.
3. Wait for the first deploy to finish and open `https://<service>.onrender.com/healthz`. It should
   report `"db":{"driver":"postgres","ok":true}`.
4. Register the PayPal webhook for that URL (from your machine, with `.env` filled in):

   ```bash
   npm run webhook:register -- https://<service>.onrender.com
   ```

   Copy the printed `PAYPAL_WEBHOOK_ID` into the Render environment and into `.env`, then let
   Render redeploy.
5. In the GitHub repository, go to **Settings → Secrets and variables → Actions → Variables** and
   add `SERVICE_URL` with the service's https URL. The [keep-alive workflow](../.github/workflows/keep-alive.yml)
   then pings `/healthz` every 10 minutes so the free service does not go to sleep.

## Checking a deploy

- `/healthz` reports `ok` and `postgres`.
- The dashboard shows PickRate 15% → 60% and "recorded demo" in the header.
- `POST /mcp` with the bearer token lists six tools.
- Chitti can find a product and start a PayPal sandbox checkout; after approval, the order shows in
  the Prove tab and the webhook marks it verified.

## Free-tier limits to know

- Render free web services sleep after 15 minutes without traffic; the keep-alive workflow
  prevents that. A free instance has about 750 hours a month, enough for one always-on service.
- Neon free tier suspends compute when idle and wakes in about a second.
- Gemini and Groq free tiers have request and token limits; the app paces itself under them and
  falls back to the other provider.
