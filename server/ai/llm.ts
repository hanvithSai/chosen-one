import { APICallError, generateText, Output, type LanguageModel } from "ai";
import type { Logger } from "pino";
import type { ZodType } from "zod";
import { QuotaExceededError, QuotaGuard } from "./quota.js";

/** `gemini` and `groq` are the two panel models; `main` is the stronger Gemini model for fixes. */
export type LlmSlot = "gemini" | "groq" | "main";

export interface LlmModel {
  slot: LlmSlot;
  model: LanguageModel;
  guard: QuotaGuard;
}

export class LlmUnavailableError extends Error {}

export interface StructuredRequest<T> {
  slot: LlmSlot;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /** Rough token count of the request, used for pacing before the real usage is known. */
  estimatedTokens?: number;
}

export interface LlmResult<T> {
  data: T;
  slot: LlmSlot;
  modelId: string;
  tokens: number;
}

/** Slot to try when the preferred provider is out of free-tier quota. */
const FALLBACK: Record<LlmSlot, LlmSlot | undefined> = {
  gemini: "groq",
  groq: "gemini",
  main: "gemini",
};

/** Overload and rate-limit replies are transient: worth trying the other provider. */
export function isProviderBusy(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    return err.statusCode === 429 || err.statusCode === 503 || err.statusCode === 529;
  }
  return err instanceof Error && /high demand|overloaded|rate limit/i.test(err.message);
}

/** Calls free-tier LLMs inside their quotas, falling back to the other provider when needed. */
export class LlmService {
  private readonly models = new Map<LlmSlot, LlmModel>();

  constructor(
    models: LlmModel[],
    private readonly logger?: Logger,
  ) {
    for (const entry of models) this.models.set(entry.slot, entry);
  }

  has(slot: LlmSlot): boolean {
    return this.models.has(slot);
  }

  get(slot: LlmSlot): LlmModel {
    const entry = this.models.get(slot);
    if (!entry) throw new LlmUnavailableError(`No model configured for slot "${slot}"`);
    return entry;
  }

  /**
   * Runs `fn` against a slot under its quota guard. On a quota error, retries once on the
   * fallback slot so a run keeps going instead of failing.
   */
  async run<T>(
    slot: LlmSlot,
    estimatedTokens: number,
    fn: (entry: LlmModel) => Promise<{ value: T; tokens: number }>,
  ): Promise<{ value: T; slot: LlmSlot; modelId: string; tokens: number }> {
    const order = [slot, FALLBACK[slot]].filter(
      (s): s is LlmSlot => s !== undefined && this.models.has(s),
    );
    if (order.length === 0) throw new LlmUnavailableError(`No model configured for "${slot}"`);

    let lastError: unknown;
    for (const candidate of order) {
      const entry = this.get(candidate);
      try {
        await entry.guard.reserve(estimatedTokens);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          this.logger?.warn({ slot: candidate, reason: err.reason }, "LLM quota reached");
          lastError = err;
          continue;
        }
        throw err;
      }
      try {
        const { value, tokens } = await fn(entry);
        await entry.guard.record(tokens, estimatedTokens);
        return { value, slot: candidate, modelId: entry.guard.model, tokens };
      } catch (err) {
        if (!isProviderBusy(err)) throw err;
        this.logger?.warn({ slot: candidate }, "LLM provider busy; trying the other provider");
        lastError = err;
      }
    }
    throw lastError;
  }

  /** One structured-output call: the model's reply is validated against `schema`. */
  async generateStructured<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
    const estimated = request.estimatedTokens ?? 2000;
    const out = await this.run(request.slot, estimated, async (entry) => {
      const result = await generateText({
        model: entry.model,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: request.abortSignal,
        maxRetries: 1,
      });
      return {
        value: result.output as T,
        tokens: result.usage?.totalTokens ?? estimated,
      };
    });
    return { data: out.value, slot: out.slot, modelId: out.modelId, tokens: out.tokens };
  }
}
