/**
 * Captures the competitor market once and commits it, so the demo never needs live credits.
 *   npm run market:snapshot
 * Uses about one Channel3 credit per search (10 searches). Writes data/market/snapshot.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { Channel3Client } from "../server/market/channel3.js";
import { fetchSnapshot, MARKET_QUERIES } from "../server/market/snapshot.js";

loadDotEnvFile();
const config = loadConfig();
if (!config.CHANNEL3_API_KEY) throw new Error("Set CHANNEL3_API_KEY in .env first.");

const snapshot = await fetchSnapshot(new Channel3Client({ apiKey: config.CHANNEL3_API_KEY }));
const target = path.resolve("data/market/snapshot.json");
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);

const sellers = new Set(snapshot.products.map((p) => p.storeLabel));
console.log(
  `Saved ${snapshot.products.length} products from ${sellers.size} anonymised sellers ` +
    `for ${MARKET_QUERIES.length} searches to ${path.relative(process.cwd(), target)}`,
);
