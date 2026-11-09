import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema.js";

/** Driver-agnostic database type shared by Postgres (Neon) and PGlite. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbDriver = "postgres" | "pglite";

export interface DbHandle {
  db: Db;
  driver: DbDriver;
  migrate(): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface DbOptions {
  /** Postgres connection string (Neon in production). When absent, PGlite is used. */
  databaseUrl?: string;
  /** PGlite data directory, or "memory://" for an ephemeral in-memory database. */
  pgliteDataDir?: string;
  migrationsDir?: string;
}

export const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), "server/db/migrations");
export const IN_MEMORY = "memory://";

export async function openDatabase(options: DbOptions = {}): Promise<DbHandle> {
  const migrationsFolder = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 5 });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      driver: "postgres",
      migrate: () => migratePg(db, { migrationsFolder }),
      ping: () => ping(db),
      close: () => pool.end(),
    };
  }

  const dataDir = options.pgliteDataDir ?? IN_MEMORY;
  if (dataDir !== IN_MEMORY) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    driver: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder }),
    ping: () => ping(db),
    close: () => client.close(),
  };
}

async function ping(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
