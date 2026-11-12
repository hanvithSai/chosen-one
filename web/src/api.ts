export interface Store {
  merchant: { name: string; tagline: string | null };
  catalogVersion: number;
  products: number;
  mode: "live" | "replay";
}

export interface LostReason {
  category: string;
  count: number;
  examples: string[];
}

export interface IntentResult {
  position: number;
  text: string;
  model: string;
  outcome: "bought_ours" | "bought_competitor" | "no_purchase" | "error";
  chosenStore: string | null;
  rationale: string | null;
  ourReason?: { category: string; reason: string | null; product: string };
}

export interface PanelSummary {
  panelId: string;
  label: string;
  status: string;
  recorded: boolean;
  pickRate: number;
  totalRuns: number;
  boughtOurs: number;
  boughtCompetitor: number;
  noPurchase: number;
  errors: number;
  lostTo: { store: string; count: number }[];
  lostReasons: LostReason[];
  results: IntentResult[];
}

export interface PanelComparison {
  before: { panelId: string; label: string; pickRate: number };
  after: { panelId: string; label: string; pickRate: number };
  deltaPoints: number;
  gained: { position: number; text: string; reason: string | null }[];
  lost: { position: number; text: string }[];
}

export interface Proposal {
  id: string;
  sku: string;
  productTitle: string;
  field: string;
  value: string;
  quote: string | null;
  noteTitle: string | null;
  reasonCategory: string | null;
  status: string;
}

export interface Activity {
  orders: {
    paypalOrderId: string;
    cartId: string;
    status: string;
    amount: string;
    currency: string;
    agent: string | null;
    captureId: string | null;
    webhookConfirmed: boolean;
    createdAt: string;
  }[];
  totals: {
    agentOrders: number;
    capturedOrders: number;
    pendingOrders: number;
    capturedRevenue: string;
    toolCallsLast7Days: number;
  };
  toolCalls: {
    byTool: { tool: string; calls: number }[];
    byAgent: { agent: string; calls: number }[];
    recent: { at: string; agent: string; tool: string; channel: string }[];
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export interface Dashboard {
  store: Store;
  baseline?: PanelSummary;
  after?: PanelSummary;
  comparison?: PanelComparison;
  proposals: Proposal[];
  activity: Activity;
}

/** Loads everything the dashboard shows. Baseline is the oldest panel, "after" the newest. */
export async function loadDashboard(): Promise<Dashboard> {
  const [store, list, proposals, activity] = await Promise.all([
    get<Store>("/api/store"),
    get<{ panels: Omit<PanelSummary, "results">[] }>("/api/panels"),
    get<{ proposals: Proposal[] }>("/api/proposals"),
    get<Activity>("/api/activity"),
  ]);
  const newestFirst = list.panels;
  const baselineMeta = newestFirst.length > 0 ? newestFirst[newestFirst.length - 1] : undefined;
  const afterMeta = newestFirst.length > 1 ? newestFirst[0] : undefined;
  const [baseline, after, comparison] = await Promise.all([
    baselineMeta ? get<PanelSummary>(`/api/panels/${baselineMeta.panelId}`) : undefined,
    afterMeta ? get<PanelSummary>(`/api/panels/${afterMeta.panelId}`) : undefined,
    baselineMeta && afterMeta
      ? get<PanelComparison>(
          `/api/panels/compare?before=${baselineMeta.panelId}&after=${afterMeta.panelId}`,
        )
      : undefined,
  ]);
  return { store, baseline, after, comparison, proposals: proposals.proposals, activity };
}

export const REASON_LABELS: Record<string, string> = {
  missing_fact: "A fact the shopper needed was not stated",
  not_found: "The listing never showed up for the search",
  delivery_unknown: "No delivery time or destination stated",
  shipping_cost: "Shipping cost unclear or too high",
  returns_unknown: "No return policy stated",
  price: "Price too high",
  quality_signal: "Not enough sign of quality",
  better_alternative: "Another listing was clearly better",
  wrong_product: "Not quite the product asked for",
};
