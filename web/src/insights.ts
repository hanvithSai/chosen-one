import type { IntentResult, PanelSummary } from "./api";

export interface Action {
  title: string;
  detail: string;
  /** Which page the merchant goes to do it. */
  where: "fixes" | "catalog" | "policy";
}

/** What a merchant should do about each kind of lost sale. */
export const ACTIONS: Record<string, Action> = {
  missing_fact: {
    title: "State the missing fact on the listing",
    detail:
      "The shopper needed a fact the listing does not say. Add it to your notes and approve the fix.",
    where: "fixes",
  },
  delivery_unknown: {
    title: "Say where you ship and how fast",
    detail:
      "Shoppers will not buy when delivery time or destination is not stated. Add it to every listing.",
    where: "policy",
  },
  returns_unknown: {
    title: "Publish your return policy on the listing",
    detail: "Gift buyers check returns first. State the window and who pays.",
    where: "policy",
  },
  shipping_cost: {
    title: "Make shipping cost clear",
    detail: "State the flat rate and the free-shipping threshold on the listing.",
    where: "policy",
  },
  price: {
    title: "Review price or offer a bundle",
    detail: "A shopper chose a cheaper listing. Consider a set, a bundle or a clearer value story.",
    where: "catalog",
  },
  quality_signal: {
    title: "Add materials, origin or reviews",
    detail:
      "Shoppers look for proof of quality: materials, how it is made, tested glazes, reviews.",
    where: "fixes",
  },
  better_alternative: {
    title: "Match what the winning listing states",
    detail: "A competitor's listing was clearer. List the facts it states that yours does not.",
    where: "fixes",
  },
  wrong_product: {
    title: "You may not sell what they asked for",
    detail:
      "No listing matched the request. Consider adding the product, a bigger quantity or a variant.",
    where: "catalog",
  },
  not_found: {
    title: "Make the listing easy to find",
    detail:
      "None of your listings appeared for this search. Use the words shoppers use in the title.",
    where: "catalog",
  },
};

export const FALLBACK_ACTION: Action = {
  title: "Review this listing",
  detail: "The shopper did not choose your store. Read their reason and add what is missing.",
  where: "fixes",
};

export const CATEGORY_LABEL: Record<string, string> = {
  missing_fact: "Fact not stated",
  delivery_unknown: "Delivery unclear",
  returns_unknown: "Returns unclear",
  shipping_cost: "Shipping cost",
  price: "Price",
  quality_signal: "Quality proof",
  better_alternative: "Competitor clearer",
  wrong_product: "Product not offered",
  not_found: "Not found in search",
};

export function actionFor(category?: string): Action {
  return (category && ACTIONS[category]) || FALLBACK_ACTION;
}

export interface LostRequest {
  result: IntentResult;
  action: Action;
  category?: string;
}

/** Requests the store did not win in `panel`, with what to do about each. */
export function lostRequests(panel: PanelSummary): LostRequest[] {
  return panel.results
    .filter((r) => r.outcome !== "bought_ours")
    .map((result) => ({
      result,
      category: result.ourReason?.category,
      action: actionFor(result.ourReason?.category),
    }));
}

/** Requests lost in the baseline run and won after the fixes. */
export function recoveredRequests(baseline: PanelSummary, after: PanelSummary): IntentResult[] {
  const won = new Set(
    after.results.filter((r) => r.outcome === "bought_ours").map((r) => r.position),
  );
  return baseline.results.filter((r) => r.outcome !== "bought_ours" && won.has(r.position));
}

/** Groups lost requests by what to do about them, biggest first. */
export function opportunities(lost: LostRequest[]) {
  const groups = new Map<string, { action: Action; category: string; items: LostRequest[] }>();
  for (const item of lost) {
    const key = item.category ?? "other";
    const group = groups.get(key) ?? { action: item.action, category: key, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}
