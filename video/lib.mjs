import { readFileSync } from "node:fs";
export const BASE = process.env.BASE ?? "https://chosen-one-q4ox.onrender.com";
export const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
export const env = Object.fromEntries(
  readFileSync("../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const H = { Authorization: "Bearer chosenone-demo-2026", "Content-Type": "application/json", "X-Agent-Client": "video-test" };
/** A fresh sandbox order and its PayPal approval link, made through the live Cart API. */
export async function freshApprovalUrl(sku = "MB-MUG-SANDSTONE") {
  const cart = await (await fetch(`${BASE}/merchant-cart`, { method: "POST", headers: H, body: JSON.stringify({
    items: [{ item_id: sku, quantity: 1 }],
    shipping_address: { country_code: "US", postal_code: "78701", address_line_1: "500 Congress Ave", admin_area_2: "Austin", admin_area_1: "TX" } }) })).json();
  const out = await (await fetch(`${BASE}/merchant-cart/${cart.id}/checkout`, { method: "POST", headers: H, body: "{}" })).json();
  return { cartId: cart.id, url: out.payment_method.approval_url };
}
