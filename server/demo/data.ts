import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_DEMO_DIR = path.resolve(process.cwd(), "data/demo");

const MerchantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tagline: z.string().min(1),
  location: z.string().min(1),
  about: z.string().min(1),
});

const ProductSchema = z.object({
  sku: z.string().regex(/^MB-[A-Z0-9-]+$/),
  line: z.enum(["stoneware", "terracotta", "raku"]),
  title: z.string().min(1),
  description: z.string().min(1),
  priceCents: z.number().int().positive(),
  stock: z.number().int().nonnegative(),
});

const SourceNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(20),
});

const IntentSchema = z.object({
  text: z.string().min(10),
  persona: z.string().min(1),
  constraints: z.record(z.string(), z.unknown()),
});

export type DemoMerchant = z.infer<typeof MerchantSchema>;
export type DemoProduct = z.infer<typeof ProductSchema>;
export type DemoSourceNote = z.infer<typeof SourceNoteSchema>;
export type DemoIntent = z.infer<typeof IntentSchema>;

export interface DemoData {
  merchant: DemoMerchant;
  products: DemoProduct[];
  sourceNotes: DemoSourceNote[];
  intents: DemoIntent[];
}

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8"));
}

/** Loads and validates the demo merchant files. Throws with the offending file on bad data. */
export function loadDemoData(dir: string = DEFAULT_DEMO_DIR): DemoData {
  const parse = <T>(schema: z.ZodType<T>, file: string): T => {
    const result = schema.safeParse(readJson(dir, file));
    if (!result.success) throw new Error(`Invalid demo data in ${file}: ${result.error.message}`);
    return result.data;
  };

  const data: DemoData = {
    merchant: parse(MerchantSchema, "merchant.json"),
    products: parse(z.array(ProductSchema).min(1), "catalog.json"),
    sourceNotes: parse(z.array(SourceNoteSchema).min(1), "source-notes.json"),
    intents: parse(z.array(IntentSchema).min(1), "intents.json"),
  };

  const skus = new Set<string>();
  for (const product of data.products) {
    if (skus.has(product.sku)) throw new Error(`Duplicate SKU in catalog.json: ${product.sku}`);
    skus.add(product.sku);
  }
  return data;
}
