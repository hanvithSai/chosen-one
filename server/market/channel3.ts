import { z } from "zod";

const BASE_URL = "https://api.trychannel3.com";

const OfferSchema = z.object({
  domain: z.string().optional(),
  price: z.object({ price: z.number(), currency: z.string() }).optional(),
  availability: z.string().optional(),
});

const ProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  brands: z.array(z.object({ name: z.string() })).nullish(),
  category: z.object({ title: z.string().optional() }).nullish(),
  materials: z.array(z.string()).nullish(),
  key_features: z.array(z.string()).nullish(),
  structured_attributes: z.record(z.string(), z.array(z.string())).nullish(),
  offers: z.array(OfferSchema).nullish(),
});

const SearchResponseSchema = z.object({ products: z.array(ProductSchema) });

/** A product reduced to what the shopper panel needs. Links and images are not kept. */
export interface Channel3Product {
  id: string;
  title: string;
  description: string;
  /** Seller name as Channel3 reports it. Anonymised before anything is stored. */
  seller: string;
  priceCents: number;
  currency: string;
  inStock: boolean;
  category?: string;
  materials: string[];
  keyFeatures: string[];
  attributes: Record<string, string[]>;
}

export interface Channel3ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class Channel3Error extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Minimal client for Channel3 product search (free tier: 1,000 credits a month). */
export class Channel3Client {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: Channel3ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: string, limit = 10): Promise<Channel3Product[]> {
    const res = await this.fetchImpl(`${this.options.baseUrl ?? BASE_URL}/v1/search`, {
      method: "POST",
      headers: {
        "x-api-key": this.options.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "chosen-one/0.1",
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok)
      throw new Channel3Error(`Channel3 search failed with status ${res.status}`, res.status);
    const parsed = SearchResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Channel3Error("Channel3 returned an unexpected response shape");

    const products: Channel3Product[] = [];
    for (const raw of parsed.data.products) {
      const offer = raw.offers?.find((o) => o.price && o.availability === "InStock");
      if (!offer?.price) continue; // only products with a real, buyable price
      products.push({
        id: raw.id,
        title: raw.title,
        description: raw.description ?? "",
        seller: raw.brands?.[0]?.name ?? offer.domain ?? "Unknown",
        priceCents: Math.round(offer.price.price * 100),
        currency: offer.price.currency,
        inStock: true,
        category: raw.category?.title,
        materials: raw.materials ?? [],
        keyFeatures: raw.key_features ?? [],
        attributes: raw.structured_attributes ?? {},
      });
    }
    return products;
  }
}
