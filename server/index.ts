import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig, loadDotEnvFile } from "./config.js";
import { openDatabase } from "./db/client.js";
import { loadDemoData } from "./demo/data.js";
import { seedDemo } from "./demo/seed.js";
import { createLogger } from "./logger.js";

loadDotEnvFile();
const config = loadConfig();
const logger = createLogger(config);

const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});
await database.migrate();
logger.info({ driver: database.driver }, "Database ready");

if (config.SEED_DEMO_ON_START) {
  const summary = await seedDemo(database.db, loadDemoData());
  logger.info({ created: summary.created }, "Demo merchant ready");
}

// In production the compiled server lives in dist/server and the web build in dist/web.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(here, "../web");

const app = createApp({ config, logger, database, webDistDir });

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, mode: config.DEMO_MODE }, "ChosenOne server listening");
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
