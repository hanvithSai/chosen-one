import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { CartService } from "./commerce/cart.js";
import { DEFAULT_STORE_API_TOKEN, loadConfig, loadDotEnvFile } from "./config.js";
import { openDatabase } from "./db/client.js";
import { loadDemoData } from "./demo/data.js";
import { seedRecordings } from "./demo/recordings.js";
import { seedDemo } from "./demo/seed.js";
import { Chitti } from "./buyer/chitti.js";
import { createLlm } from "./ai/providers.js";
import { createLogger } from "./logger.js";
import { PanelService } from "./panel/panelService.js";
import { seedMarket } from "./market/seed.js";
import { createGateway } from "./payments/createGateway.js";
import { createWebhookVerifier } from "./webhooks/verifier.js";

loadDotEnvFile();
const config = loadConfig();
const logger = createLogger(config);

if (config.NODE_ENV === "production" && config.STORE_API_TOKEN === DEFAULT_STORE_API_TOKEN) {
  logger.warn("STORE_API_TOKEN is using the development default; set a real token in production");
}

const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});
await database.migrate();
logger.info({ driver: database.driver }, "Database ready");

const demo = loadDemoData();
if (config.SEED_DEMO_ON_START) {
  const summary = await seedDemo(database.db, demo);
  logger.info({ created: summary.created }, "Demo merchant ready");
  const market = await seedMarket(database.db, config.MERCHANT_SLUG);
  if (market) logger.info(market, "Competitor market snapshot ready");
  const recordings = await seedRecordings(database.db, config.MERCHANT_SLUG);
  logger.info(recordings, "Demo recordings ready");
}

const gateway = createGateway(config, demo.merchant.name, logger);
const cartService = new CartService(database.db, {
  merchantSlug: config.MERCHANT_SLUG,
  policy: demo.merchant.checkout,
  publicBaseUrl: config.PUBLIC_BASE_URL,
  gateway,
  logger,
});

// In production the compiled server lives in dist/server and the web build in dist/web.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(here, "../web");

const llm = createLlm(config, database.db, logger);
const app = createApp({
  config,
  logger,
  database,
  webhookVerifier: createWebhookVerifier(config, logger),
  llm,
  buyerAgent:
    llm.has("gemini") || llm.has("groq")
      ? new Chitti({
          llm,
          mcpUrl: `http://127.0.0.1:${config.PORT}/mcp`,
          token: config.STORE_API_TOKEN,
          logger,
        })
      : undefined,
  panelService: new PanelService(database.db, llm, logger),
  commerce: { cartService, merchantSlug: config.MERCHANT_SLUG, policy: demo.merchant.checkout },
  webDistDir,
});

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, mode: config.DEMO_MODE, gateway: gateway.name },
    "ChosenOne server listening",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    database.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
