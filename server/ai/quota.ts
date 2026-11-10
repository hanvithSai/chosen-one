import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { quotaUsage } from "../db/schema.js";

/** Free-tier limits for one provider/model. Leave a field out to leave that limit unchecked. */
export interface QuotaLimits {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}

export class QuotaExceededError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
    readonly reason: string,
  ) {
    super(`Free-tier quota reached for ${provider}/${model}: ${reason}`);
  }
}

export interface QuotaGuardOptions {
  db: Db;
  provider: string;
  model: string;
  limits: QuotaLimits;
  /** Longest the guard will wait for the per-minute window to free up before giving up. */
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface WindowEntry {
  at: number;
  tokens: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Keeps one provider/model inside its free tier: per-minute limits are paced in memory,
 * per-day limits are counted in the `quota_usage` table so they survive restarts.
 */
export class QuotaGuard {
  private window: WindowEntry[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: QuotaGuardOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  get provider(): string {
    return this.options.provider;
  }

  get model(): string {
    return this.options.model;
  }

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  async usageToday(): Promise<{ requests: number; tokens: number }> {
    const [row] = await this.options.db
      .select()
      .from(quotaUsage)
      .where(
        and(
          eq(quotaUsage.provider, this.options.provider),
          eq(quotaUsage.model, this.options.model),
          eq(quotaUsage.day, this.today()),
        ),
      );
    return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
  }

  /** Waits for per-minute room, checks daily limits, and reserves one request. */
  async reserve(estimatedTokens: number): Promise<void> {
    const { limits, provider, model } = this.options;
    const used = await this.usageToday();
    if (limits.requestsPerDay !== undefined && used.requests + 1 > limits.requestsPerDay) {
      throw new QuotaExceededError(provider, model, "daily request limit");
    }
    if (limits.tokensPerDay !== undefined && used.tokens + estimatedTokens > limits.tokensPerDay) {
      throw new QuotaExceededError(provider, model, "daily token limit");
    }

    const maxWait = this.options.maxWaitMs ?? 65_000;
    let waited = 0;
    for (;;) {
      const t = this.now();
      this.window = this.window.filter((entry) => t - entry.at < 60_000);
      const tokensInWindow = this.window.reduce((sum, e) => sum + e.tokens, 0);
      const full =
        (limits.requestsPerMinute !== undefined &&
          this.window.length + 1 > limits.requestsPerMinute) ||
        (limits.tokensPerMinute !== undefined &&
          this.window.length > 0 &&
          tokensInWindow + estimatedTokens > limits.tokensPerMinute);
      if (!full) break;
      const oldest = this.window[0]!;
      const wait = Math.max(oldest.at + 60_000 - t, 50) + 25;
      if (waited + wait > maxWait) {
        throw new QuotaExceededError(provider, model, "per-minute limit");
      }
      await this.sleep(wait);
      waited += wait;
    }
    this.window.push({ at: this.now(), tokens: estimatedTokens });
  }

  /** Records what the call actually used (daily table and the minute window). */
  async record(actualTokens: number, estimatedTokens: number): Promise<void> {
    const last = [...this.window].reverse().find((entry) => entry.tokens === estimatedTokens);
    if (last) last.tokens = actualTokens;
    await this.options.db
      .insert(quotaUsage)
      .values({
        provider: this.options.provider,
        model: this.options.model,
        day: this.today(),
        requests: 1,
        tokens: actualTokens,
      })
      .onConflictDoUpdate({
        target: [quotaUsage.provider, quotaUsage.model, quotaUsage.day],
        set: {
          requests: sql`${quotaUsage.requests} + 1`,
          tokens: sql`${quotaUsage.tokens} + ${actualTokens}`,
        },
      });
  }
}
