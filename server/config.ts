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

export const DEFAULT_STORE_API_TOKEN = "local-dev-store-token";

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
  /** Seeds the Mayabazar demo merchant at startup (idempotent). */
  SEED_DEMO_ON_START: z.stringbool().default(true),
  /** Merchant whose store this deployment serves to agents. */
  MERCHANT_SLUG: z.string().default("mayabazar"),
  /** Bearer token agents present to the Cart API (stand-in for the PayPal-issued JWT). */
  STORE_API_TOKEN: z.string().min(8).default(DEFAULT_STORE_API_TOKEN),
  /** PayPal REST credentials. Without them the offline gateway is used (tests, keyless replay). */
  PAYPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().min(10).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(10).optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  /** LLM providers (free tiers) used through the Vercel AI SDK. A missing key disables that slot. */
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(10).optional(),
  GROQ_API_KEY: z.string().min(10).optional(),
  GEMINI_MAIN_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_PANEL_MODEL: z.string().default("gemini-flash-lite-latest"),
  GROQ_PANEL_MODEL: z.string().default("openai/gpt-oss-120b"),
  /** Free-tier quotas (requests/min, tokens/min, requests/day, tokens/day), kept below the real caps. */
  GEMINI_PANEL_RPM: z.coerce.number().int().positive().default(10),
  GEMINI_PANEL_TPM: z.coerce.number().int().positive().default(250000),
  GEMINI_PANEL_RPD: z.coerce.number().int().positive().default(500),
  GROQ_PANEL_RPM: z.coerce.number().int().positive().default(30),
  GROQ_PANEL_TPM: z.coerce.number().int().positive().default(8000),
  GROQ_PANEL_TPD: z.coerce.number().int().positive().default(200000),
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
