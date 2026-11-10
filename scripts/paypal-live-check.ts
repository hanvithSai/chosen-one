// Creates a real sandbox order through the PayPalGateway and prints what PayPal stored.
// Does not capture (a person must approve first). Usage: npx tsx scripts/paypal-live-check.ts
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { createGateway } from "../server/payments/createGateway.js";
import { createLogger } from "../server/logger.js";

loadDotEnvFile();
const config = loadConfig();
const logger = createLogger({ ...config, LOG_LEVEL: "warn" });
const gateway = createGateway(config, "Mayabazar", logger);
console.log("gateway:", gateway.name);

const created = await gateway.createOrder({
  requestId: `live-check-${Date.now()}`,
  cartId: "cart_livecheck",
  merchantName: "mayabazar",
  customId: "agent=live-check;cart=cart_livecheck",
  currency: "USD",
  items: [{ sku: "MB-MUG-MONSOON", name: "Monsoon Mug", unitAmountCents: 3400, quantity: 1 }],
  itemTotalCents: 3400,
  shippingCents: 800,
  handlingCents: 0,
  totalCents: 4200,
  shippingAddress: {
    addressLine1: "500 Congress Ave",
    adminArea2: "Austin",
    adminArea1: "TX",
    postalCode: "78701",
    countryCode: "US",
  },
  returnUrl: new URL("/paypal/return", config.PUBLIC_BASE_URL).toString(),
  cancelUrl: new URL("/paypal/cancel", config.PUBLIC_BASE_URL).toString(),
});
console.log("order:", created.orderId, "| status:", created.status);
console.log("approval host:", new URL(created.approvalUrl).host);
console.log("approval url:", created.approvalUrl);
