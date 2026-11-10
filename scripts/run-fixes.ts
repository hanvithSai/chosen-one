/**
 * Drafts fixes with the AI, approves the verified ones, re-runs the shopper panel and compares.
 *   npm run fixes:run -- <baselinePanelId> "After fixes"
 * Run `npm run panel:run` first to get the baseline panel id.
 */
import { createLlm } from "../server/ai/providers.js";
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { openDatabase } from "../server/db/client.js";
import { approveProposals } from "../server/enrichment/apply.js";
import { generateProposals } from "../server/enrichment/propose.js";
import { createLogger } from "../server/logger.js";
import { PanelService } from "../server/panel/panelService.js";
import { comparePanels, summarizePanel } from "../server/panel/report.js";

loadDotEnvFile();
const config = loadConfig();
const logger = createLogger(config);
const baselineId = process.argv[2];
const label = process.argv[3] ?? "After fixes";
if (!baselineId) throw new Error("Pass the baseline panel id as the first argument.");

const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});
await database.migrate();
const llm = createLlm(config, database.db, logger);

const drafted = await generateProposals(database.db, llm, config.MERCHANT_SLUG);
console.log(`Drafted ${drafted.created} verified fixes with ${drafted.modelId}`);
for (const r of drafted.rejected) console.log(`  dropped "${r.field}": ${r.why}`);

const applied = await approveProposals(database.db, config.MERCHANT_SLUG);
console.log(
  `Approved ${applied.approved} fixes -> catalog v${applied.version} (${applied.productsChanged} products)`,
);

const panelId = await new PanelService(database.db, llm, logger).runToCompletion({
  merchantSlug: config.MERCHANT_SLUG,
  label,
  onProgress: (done, total) => console.log(`  run ${done}/${total}`),
});

const before = await summarizePanel(database.db, baselineId, config.MERCHANT_SLUG);
const after = await summarizePanel(database.db, panelId, config.MERCHANT_SLUG);
if (!before || !after) throw new Error("Could not load both panels");
const diff = comparePanels(before, after);
console.log(
  `\nPickRate ${(diff.before.pickRate * 100).toFixed(0)}% -> ${(diff.after.pickRate * 100).toFixed(0)}% ` +
    `(${diff.deltaPoints >= 0 ? "+" : ""}${diff.deltaPoints} points)`,
);
console.log(`Gained ${diff.gained.length} requests, lost ${diff.lost.length}`);
for (const g of diff.gained) console.log(`  + ${g.text.slice(0, 80)}`);
console.log("Remaining reasons:");
for (const r of after.lostReasons) console.log(`  ${r.category} x${r.count}`);
console.log(`After panel id: ${panelId}`);
await database.close();
