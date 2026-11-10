/**
 * Registers (or finds) the PayPal sandbox webhook for a deployed ChosenOne URL.
 *
 *   npm run webhook:register -- https://your-service.onrender.com
 *
 * Prints the webhook id to store as PAYPAL_WEBHOOK_ID. Safe to run again: an existing
 * webhook for the same URL is reused. Sandbox only.
 */
import { loadConfig, loadDotEnvFile } from "../server/config.js";

const EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
];
const BASE = "https://api-m.sandbox.paypal.com";

loadDotEnvFile();
const config = loadConfig();
if (config.PAYPAL_ENV !== "sandbox") throw new Error("This script only supports the sandbox.");
if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) {
  throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first.");
}

const serviceUrl = process.argv[2];
if (!serviceUrl?.startsWith("https://")) {
  throw new Error("Pass the public https:// URL of the deployed service as the first argument.");
}
const webhookUrl = new URL("/webhooks/paypal", serviceUrl).toString();

const basic = Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString(
  "base64",
);
const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) throw new Error(`PayPal token request failed (${tokenRes.status})`);
const { access_token: token } = (await tokenRes.json()) as { access_token: string };
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const listRes = await fetch(`${BASE}/v1/notifications/webhooks`, { headers });
if (!listRes.ok) throw new Error(`Listing webhooks failed (${listRes.status})`);
const existing = ((await listRes.json()) as { webhooks?: { id: string; url: string }[] }).webhooks;
const found = existing?.find((w) => w.url === webhookUrl);
if (found) {
  console.log(`Webhook already registered for ${webhookUrl}`);
  console.log(`PAYPAL_WEBHOOK_ID=${found.id}`);
} else {
  const createRes = await fetch(`${BASE}/v1/notifications/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url: webhookUrl, event_types: EVENT_TYPES.map((name) => ({ name })) }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Creating the webhook failed (${createRes.status}, debug id ${createRes.headers.get("paypal-debug-id")})`,
    );
  }
  const created = (await createRes.json()) as { id: string };
  console.log(`Registered webhook for ${webhookUrl}`);
  console.log(`PAYPAL_WEBHOOK_ID=${created.id}`);
}
console.log("Add that line to .env locally and to the Render environment, then redeploy.");
