import { existsSync } from "node:fs";
import { z } from "zod";

/**
 * Loads a local .env file into process.env when present. Call only from entry points:
 * production (Render) injects real environment variables, and tests pass explicit values.
 */
export function loadDotEnvFile(file = ".env"): void {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  DEMO_MODE: z.enum(["live", "replay"]).default("live"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Neon (or any Postgres) connection string. When unset, an embedded PGlite database is used. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string")
    .optional(),
  PGLITE_DATA_DIR: z.string().default("./data/runtime/pglite"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Blank values (e.g. `KEY=` copied from .env.example) mean "unset", so defaults apply.
  const defined = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = ConfigSchema.safeParse(defined);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
