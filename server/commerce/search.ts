import MiniSearch from "minisearch";

/**
 * A product as any shopper agent sees it, whichever store it belongs to.
 * The same shape is used for the merchant's catalog and for competitor snapshots,
 * so every store is searched by the same deterministic rules.
 */
export interface MarketItem {
  /** Stable reference, unique across the market (e.g. "mayabazar:MB-MUG-MONSOON"). */
  ref: string;
  store: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  /** Structured facts. Empty for thin listings; filled in by approved enrichment. */
  attributes: Record<string, unknown>;
  inStock: boolean;
}

export interface SearchOptions {
  limit?: number;
  maxPriceCents?: number;
  store?: string;
}

export interface SearchHit {
  ref: string;
  store: string;
  title: string;
  priceCents: number;
  currency: string;
  /** Compact text an agent can reason over without fetching the full record. */
  summary: string;
  score: number;
}

interface IndexedDoc {
  id: string;
  title: string;
  description: string;
  facts: string;
}

const SUMMARY_MAX_CHARS = 220;

/** Flattens structured attributes into "key: value" text so they are searchable. */
export function attributesToText(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .map(([key, value]) => {
      const label = key.replace(/[_-]+/g, " ");
      if (typeof value === "boolean") return value ? label : `not ${label}`;
      if (Array.isArray(value)) return `${label}: ${value.join(", ")}`;
      return `${label}: ${String(value)}`;
    })
    .join("; ");
}

function summarize(item: MarketItem): string {
  const facts = attributesToText(item.attributes);
  const text = facts ? `${item.description} ${facts}` : item.description;
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS - 1)}…` : text;
}

/** In-memory full-text index over a market of items from one or more stores. */
export class MarketIndex {
  private readonly items = new Map<string, MarketItem>();
  private readonly search: MiniSearch<IndexedDoc>;

  constructor(items: MarketItem[]) {
    this.search = new MiniSearch<IndexedDoc>({
      fields: ["title", "description", "facts"],
      idField: "id",
      searchOptions: {
        boost: { title: 3, facts: 1.5 },
        prefix: true,
        fuzzy: 0.15,
        combineWith: "OR",
      },
    });
    for (const item of items) {
      if (this.items.has(item.ref)) throw new Error(`Duplicate market item ref: ${item.ref}`);
      this.items.set(item.ref, item);
    }
    this.search.addAll(
      items.map((item) => ({
        id: item.ref,
        title: item.title,
        description: item.description,
        facts: attributesToText(item.attributes),
      })),
    );
  }

  get size(): number {
    return this.items.size;
  }

  get(ref: string): MarketItem | undefined {
    return this.items.get(ref);
  }

  query(text: string, options: SearchOptions = {}): SearchHit[] {
    const limit = options.limit ?? 5;
    return (
      this.search
        .search(text)
        .map((result) => ({ item: this.items.get(result.id)!, score: result.score }))
        .filter(({ item }) => item.inStock)
        .filter(({ item }) => options.store === undefined || item.store === options.store)
        .filter(
          ({ item }) =>
            options.maxPriceCents === undefined || item.priceCents <= options.maxPriceCents,
        )
        // Deterministic ordering: score first, then ref as a stable tie-breaker.
        .sort((a, b) => b.score - a.score || a.item.ref.localeCompare(b.item.ref))
        .slice(0, limit)
        .map(({ item, score }) => ({
          ref: item.ref,
          store: item.store,
          title: item.title,
          priceCents: item.priceCents,
          currency: item.currency,
          summary: summarize(item),
          score: Math.round(score * 1000) / 1000,
        }))
    );
  }
}
