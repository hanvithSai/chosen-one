// Captures an approved sandbox order through the PayPalGateway. Usage: npx tsx scripts/paypal-capture-check.ts <orderId>
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { createLogger } from "../server/logger.js";
import { createGateway } from "../server/payments/createGateway.js";

const orderId = process.argv[2];
if (!orderId) throw new Error("Usage: paypal-capture-check.ts <orderId>");
loadDotEnvFile();
const config = loadConfig();
const gateway = createGateway(config, "Mayabazar", createLogger({ ...config, LOG_LEVEL: "warn" }));
const first = await gateway.captureOrder(orderId, `capture-${orderId}`);
console.log("first capture:", first);
const second = await gateway.captureOrder(orderId, `capture-${orderId}`);
console.log("repeat capture (idempotent):", second);
