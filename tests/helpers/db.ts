import { openDatabase, type DbHandle } from "../../server/db/client.js";
import { loadDemoData } from "../../server/demo/data.js";
import { seedDemo, type SeedSummary } from "../../server/demo/seed.js";

export interface TestDatabase extends DbHandle {
  seed?: SeedSummary;
}

/** Creates a fresh in-memory PGlite database with migrations applied (and optionally demo data). */
export async function createTestDatabase(options: { seed?: boolean } = {}): Promise<TestDatabase> {
  const database: TestDatabase = await openDatabase();
  await database.migrate();
  if (options.seed) database.seed = await seedDemo(database.db, loadDemoData());
  return database;
}
