/**
 * Runs the AI shopper panel against the demo store and prints the result.
 *   npm run panel:run -- "Baseline"
 * Uses the free-tier Gemini and Groq keys in .env (about 20 model calls).
 */
import { createLlm } from "../server/ai/providers.js";
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { openDatabase } from "../server/db/client.js";
import { loadDemoData } from "../server/demo/data.js";
import { seedDemo } from "../server/demo/seed.js";
import { createLogger } from "../server/logger.js";
import { seedMarket } from "../server/market/seed.js";
import { PanelService } from "../server/panel/panelService.js";
import { summarizePanel } from "../server/panel/report.js";

loadDotEnvFile();
const config = loadConfig();
const logger = createLogger(config);
const label = process.argv[2] ?? "Baseline";

const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});
await database.migrate();
await seedDemo(database.db, loadDemoData());
await seedMarket(database.db, config.MERCHANT_SLUG);

const llm = createLlm(config, database.db, logger);
const service = new PanelService(database.db, llm, logger);
const panelId = await service.runToCompletion({
  merchantSlug: config.MERCHANT_SLUG,
  label,
  onProgress: (done, total) => console.log(`  run ${done}/${total}`),
});
const summary = await summarizePanel(database.db, panelId, config.MERCHANT_SLUG);
if (!summary) throw new Error("Panel not found after run");

console.log(`\nPanel "${summary.label}" ${summary.status}`);
console.log(
  `PickRate ${(summary.pickRate * 100).toFixed(0)}%  ` +
    `(ours ${summary.boughtOurs}, competitors ${summary.boughtCompetitor}, ` +
    `no purchase ${summary.noPurchase}, errors ${summary.errors})`,
);
console.log("Lost to:", summary.lostTo.map((l) => `${l.store} x${l.count}`).join(", ") || "-");
console.log("Why we lost:");
for (const r of summary.lostReasons)
  console.log(`  ${r.category} x${r.count}: ${r.examples[0] ?? ""}`);
console.log(`Panel id: ${panelId}`);
await database.close();
