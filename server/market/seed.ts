import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "../db/client.js";
import { saveSnapshot, SnapshotFileSchema } from "./snapshot.js";

export const DEFAULT_SNAPSHOT_FILE = path.resolve(process.cwd(), "data/market/snapshot.json");

/** Loads the committed competitor snapshot into the database. Idempotent; skips if no file. */
export async function seedMarket(
  db: Db,
  merchantSlug: string,
  file: string = DEFAULT_SNAPSHOT_FILE,
): Promise<{ created: boolean; products: number } | undefined> {
  if (!existsSync(file)) return undefined;
  const snapshot = SnapshotFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const saved = await saveSnapshot(db, merchantSlug, snapshot);
  return { created: saved.created, products: snapshot.products.length };
}
