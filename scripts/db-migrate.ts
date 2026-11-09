// Applies pending migrations to the configured database (Neon if DATABASE_URL is set, else PGlite).
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { openDatabase } from "../server/db/client.js";

loadDotEnvFile();
const config = loadConfig();
const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});

try {
  await database.migrate();
  console.log(`Migrations applied (${database.driver}).`);
} finally {
  await database.close();
}
