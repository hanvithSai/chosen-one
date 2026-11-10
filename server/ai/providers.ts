import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { Logger } from "pino";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { LlmService, type LlmModel } from "./llm.js";
import { QuotaGuard } from "./quota.js";

/** Builds the free-tier model slots for whichever provider keys are configured. */
export function createLlm(config: AppConfig, db: Db, logger?: Logger): LlmService {
  const models: LlmModel[] = [];

  if (config.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY });
    const panelLimits = {
      requestsPerMinute: config.GEMINI_PANEL_RPM,
      tokensPerMinute: config.GEMINI_PANEL_TPM,
      requestsPerDay: config.GEMINI_PANEL_RPD,
    };
    models.push({
      slot: "gemini",
      model: google(config.GEMINI_PANEL_MODEL),
      guard: new QuotaGuard({
        db,
        provider: "google",
        model: config.GEMINI_PANEL_MODEL,
        limits: panelLimits,
      }),
    });
    models.push({
      slot: "main",
      model: google(config.GEMINI_MAIN_MODEL),
      guard: new QuotaGuard({
        db,
        provider: "google",
        model: config.GEMINI_MAIN_MODEL,
        limits: { requestsPerMinute: 5, requestsPerDay: 100 },
      }),
    });
  }

  if (config.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: config.GROQ_API_KEY });
    models.push({
      slot: "groq",
      model: groq(config.GROQ_PANEL_MODEL),
      guard: new QuotaGuard({
        db,
        provider: "groq",
        model: config.GROQ_PANEL_MODEL,
        limits: {
          requestsPerMinute: config.GROQ_PANEL_RPM,
          tokensPerMinute: config.GROQ_PANEL_TPM,
          tokensPerDay: config.GROQ_PANEL_TPD,
        },
      }),
    });
  }

  if (models.length === 0) {
    logger?.warn("No LLM provider keys set; AI features will report as unavailable");
  }
  return new LlmService(models, logger);
}
