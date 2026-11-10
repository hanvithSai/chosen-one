import { z } from "zod";
import type { LlmResult, LlmService, LlmSlot } from "../ai/llm.js";
import { attributesToText, type MarketIndex, type MarketItem } from "../commerce/search.js";

export const REASON_CATEGORIES = [
  "price",
  "missing_fact",
  "delivery_unknown",
  "shipping_cost",
  "returns_unknown",
  "quality_signal",
  "better_alternative",
  "wrong_product",
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export const ShopperDecisionSchema = z.object({
  chosen_ref: z.string().nullable().describe("ref of the one listing you would buy, or null"),
  rationale: z.string().describe("One or two sentences: why this listing, or why none"),
  considerations: z
    .array(
      z.object({
        ref: z.string(),
        verdict: z.enum(["chosen", "shortlisted", "rejected"]),
        reason: z.string().describe("Short, specific reason tied to the request"),
        reason_category: z.enum(REASON_CATEGORIES),
      }),
    )
    .describe("One entry for every listing you were shown"),
});
export type ShopperDecision = z.infer<typeof ShopperDecisionSchema>;

export interface IntentInput {
  text: string;
  persona: string | null;
  constraints: Record<string, unknown>;
}

const MAX_DESCRIPTION_CHARS = 420;

function listingText(item: MarketItem): string {
  const facts = attributesToText(item.attributes);
  const description =
    item.description.length > MAX_DESCRIPTION_CHARS
      ? `${item.description.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`
      : item.description;
  return [
    `ref: ${item.ref}`,
    `seller: ${item.store}`,
    `title: ${item.title}`,
    `price: ${(item.priceCents / 100).toFixed(2)} ${item.currency}`,
    `description: ${description}`,
    `facts: ${facts || "(none stated)"}`,
  ].join("\n");
}

export const SHOPPER_SYSTEM = `You are an AI shopping agent buying for a real person. You are shown listings found for their request.

Rules:
- Use only facts written in the listings. If the request needs something a listing does not state (for example "dishwasher safe", delivery time, return policy), treat it as unconfirmed. Do not assume it.
- Pick the single listing you would buy for this person, or none if no listing is good enough.
- Judge every listing you were shown: "chosen" for your pick, "shortlisted" for a close second, "rejected" otherwise.
- Give each a short, specific reason, and a reason_category: price, missing_fact (a required fact is not stated), delivery_unknown, shipping_cost, returns_unknown, quality_signal, better_alternative (another listing is clearly better), or wrong_product.
- Only use refs from the listings. Reply with the requested JSON only.`;

export function buildShopperPrompt(intent: IntentInput, candidates: MarketItem[]): string {
  const lines = [`Request: ${intent.text}`];
  if (intent.persona) lines.push(`Shopper: ${intent.persona}`);
  lines.push("", `Listings found (${candidates.length}):`);
  candidates.forEach((item, i) => lines.push("", `Listing ${i + 1}`, listingText(item)));
  return lines.join("\n");
}

const STOP_WORDS = new Set(
  (
    "a an and are as at be but by can could for from get has have how i if in into is it its just " +
    "like me my of on one or our so some something that the their them then there these they this " +
    "to up us was we what when which who will with would you your need needs looking look find want " +
    "wants ideally around about at least most must should easy every enough also under over ship " +
    "shipped delivered delivery arrives arrive reach next week party gift gifts someone mom dad " +
    "sister grandma family friend friends team company invoice budget free shipping return returns " +
    "within days day set pair two four six sixty thirty big large small new best cheapest good " +
    "sturdy don doesn won"
  ).split(" "),
);

/** Turns a shopper's sentence into the short search a person would type. */
export function shoppingQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/\$[\d.,]+/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].join(" ");
}

/**
 * Finds the listings a shopper agent would see for a request: results for the short search
 * a person would type, topped up with results for the full sentence. Deterministic.
 */
export function findCandidates(index: MarketIndex, intent: IntentInput, limit = 8): MarketItem[] {
  const refs: string[] = [];
  const add = (hits: { ref: string }[]) => {
    for (const hit of hits) if (!refs.includes(hit.ref) && refs.length < limit) refs.push(hit.ref);
  };
  add(index.query(shoppingQuery(intent.text), { limit }));
  add(index.query(intent.text, { limit: Math.max(limit - refs.length, 0) }));
  return refs.map((ref) => index.get(ref)).filter((item): item is MarketItem => item !== undefined);
}

export interface ShopperRun {
  decision: ShopperDecision;
  candidates: MarketItem[];
  prompt: string;
  llm: Pick<LlmResult<unknown>, "slot" | "modelId" | "tokens">;
}

/** One mystery-shopper run: retrieve listings, then let the model decide. */
export async function runShopper(
  llm: LlmService,
  index: MarketIndex,
  intent: IntentInput,
  slot: LlmSlot,
): Promise<ShopperRun> {
  const candidates = findCandidates(index, intent);
  const prompt = buildShopperPrompt(intent, candidates);
  if (candidates.length === 0) {
    return {
      decision: {
        chosen_ref: null,
        rationale: "No listings matched this request.",
        considerations: [],
      },
      candidates,
      prompt,
      llm: { slot, modelId: "none", tokens: 0 },
    };
  }
  const result = await llm.generateStructured({
    slot,
    system: SHOPPER_SYSTEM,
    prompt,
    schema: ShopperDecisionSchema,
    maxOutputTokens: 1500,
    estimatedTokens: 700 + candidates.length * 220,
  });
  return {
    decision: result.data,
    candidates,
    prompt,
    llm: { slot: result.slot, modelId: result.modelId, tokens: result.tokens },
  };
}
