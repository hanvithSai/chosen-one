// Seeds the Mayabazar demo merchant into the configured database. Safe to run repeatedly.
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { openDatabase } from "../server/db/client.js";
import { loadDemoData } from "../server/demo/data.js";
import { seedDemo } from "../server/demo/seed.js";

loadDotEnvFile();
const config = loadConfig();
const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});

try {
  await database.migrate();
  const summary = await seedDemo(database.db, loadDemoData());
  console.log(JSON.stringify({ driver: database.driver, ...summary }, null, 2));
} finally {
  await database.close();
}
