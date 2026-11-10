/** Makes one tiny structured call per configured free-tier slot. Run: npx tsx scripts/llm-live-check.ts */
import { z } from "zod";
import { createLlm } from "../server/ai/providers.js";
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { openDatabase } from "../server/db/client.js";
import type { LlmSlot } from "../server/ai/llm.js";

loadDotEnvFile();
const config = loadConfig();
const database = await openDatabase();
await database.migrate();
const llm = createLlm(config, database.db);

const schema = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });
for (const slot of ["gemini", "groq", "main"] as LlmSlot[]) {
  if (!llm.has(slot)) {
    console.log(`${slot}: skipped (no key)`);
    continue;
  }
  try {
    const result = await llm.generateStructured({
      slot,
      system: "Answer briefly.",
      prompt: "Which is a better gift for a tea lover: a stoneware mug or a plastic cup?",
      schema,
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(40_000),
      estimatedTokens: 300,
    });
    console.log(`${slot}: ok (${result.modelId}, ${result.tokens} tokens) ->`, result.data);
  } catch (err) {
    console.log(`${slot}: FAILED -`, err instanceof Error ? err.message.slice(0, 200) : err);
  }
}
await database.close();
