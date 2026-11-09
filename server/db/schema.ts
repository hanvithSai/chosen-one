import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Merchant and catalog
// ---------------------------------------------------------------------------

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  paypalMerchantId: text("paypal_merchant_id"),
  createdAt: createdAt(),
});

/** Every catalog change creates a new version, so panels can be compared before and after a fix. */
export const catalogVersions = pgTable(
  "catalog_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    version: integer("version").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("catalog_versions_merchant_version_uq").on(t.merchantId, t.version)],
);

export type ProductLine = "stoneware" | "terracotta" | "raku";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => catalogVersions.id),
    sku: text("sku").notNull(),
    line: text("line").$type<ProductLine>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    stock: integer("stock").notNull(),
    /** Structured, agent-readable facts (care, dimensions, materials ...). */
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    imageUrl: text("image_url"),
  },
  (t) => [uniqueIndex("products_version_sku_uq").on(t.catalogVersionId, t.sku)],
);

/** The merchant's own unstructured material; enrichment must quote it. */
export const sourceNotes = pgTable("source_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Competitor market
// ---------------------------------------------------------------------------

export const marketSnapshots = pgTable("market_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  querySet: jsonb("query_set").$type<string[]>().notNull(),
  createdAt: createdAt(),
});

export const competitorProducts = pgTable(
  "competitor_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => marketSnapshots.id),
    /** Anonymized store label shown to users and agents, e.g. "Competitor A". */
    storeLabel: text("store_label").notNull(),
    externalId: text("external_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("competitor_products_snapshot_idx").on(t.snapshotId)],
);

// ---------------------------------------------------------------------------
// Shopper panels
// ---------------------------------------------------------------------------

export const intentSets = pgTable("intent_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const intents = pgTable(
  "intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentSetId: uuid("intent_set_id")
      .notNull()
      .references(() => intentSets.id),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    persona: text("persona"),
    constraints: jsonb("constraints").$type<Record<string, unknown>>().notNull().default({}),
    /** Fixed per intent so before/after comparisons use the same model. */
    assignedModel: text("assigned_model").notNull(),
  },
  (t) => [uniqueIndex("intents_set_position_uq").on(t.intentSetId, t.position)],
);

export type PanelStatus = "queued" | "running" | "completed" | "failed";

export const panels = pgTable("panels", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogVersionId: uuid("catalog_version_id")
    .notNull()
    .references(() => catalogVersions.id),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => marketSnapshots.id),
  intentSetId: uuid("intent_set_id")
    .notNull()
    .references(() => intentSets.id),
  label: text("label").notNull(),
  status: text("status").$type<PanelStatus>().notNull().default("queued"),
  /** True for runs committed as demo recordings (served in replay mode). */
  recorded: boolean("recorded").notNull().default(false),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export type RunOutcome = "bought_ours" | "bought_competitor" | "no_purchase" | "error";

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => panels.id),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => intents.id),
    model: text("model").notNull(),
    outcome: text("outcome").$type<RunOutcome>().notNull(),
    chosenStore: text("chosen_store"),
    chosenProductRef: text("chosen_product_ref"),
    rationale: text("rationale"),
    transcript: jsonb("transcript").$type<unknown[]>().notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("runs_panel_idx").on(t.panelId)],
);

export type Verdict = "not_found" | "viewed" | "shortlisted" | "rejected" | "chosen";

export const considerations = pgTable(
  "considerations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    store: text("store").notNull(),
    productRef: text("product_ref").notNull(),
    verdict: text("verdict").$type<Verdict>().notNull(),
    reason: text("reason"),
    reasonCategory: text("reason_category"),
  },
  (t) => [index("considerations_run_idx").on(t.runId)],
);

// ---------------------------------------------------------------------------
// Catalog fixes
// ---------------------------------------------------------------------------

export type ProposalStatus = "proposed" | "needs_confirmation" | "approved" | "rejected";

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    sourceNoteId: uuid("source_note_id").references(() => sourceNotes.id),
    /** Exact text quoted from the source note that supports the value. */
    quote: text("quote"),
    reasonCategory: text("reason_category"),
    status: text("status").$type<ProposalStatus>().notNull().default("proposed"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("proposals_product_idx").on(t.productId)],
);

// ---------------------------------------------------------------------------
// Agent commerce: carts, PayPal orders, webhooks
// ---------------------------------------------------------------------------

export type CartStatus = "CREATED" | "INCOMPLETE" | "READY" | "COMPLETED";
export type CartValidationStatus = "VALID" | "INVALID" | "REQUIRES_ADDITIONAL_INFORMATION";

export const carts = pgTable("carts", {
  /** Public, agent-facing identifier (e.g. "cart_..."). */
  id: text("id").primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  catalogVersionId: uuid("catalog_version_id")
    .notNull()
    .references(() => catalogVersions.id),
  status: text("status").$type<CartStatus>().notNull(),
  validationStatus: text("validation_status").$type<CartValidationStatus>().notNull(),
  /** Full Cart API v1 representation as last returned to the agent. */
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  agentClient: text("agent_client"),
  paypalOrderId: text("paypal_order_id"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  paypalOrderId: text("paypal_order_id").primaryKey(),
  cartId: text("cart_id")
    .notNull()
    .references(() => carts.id),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  customId: text("custom_id").notNull(),
  agentClient: text("agent_client"),
  captureId: text("capture_id"),
  /** PayPal debug_id values from every call on this order, for support and audits. */
  debugIds: jsonb("debug_ids").$type<string[]>().notNull().default([]),
  webhookConfirmed: boolean("webhook_confirmed").notNull().default(false),
  reconciled: boolean("reconciled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  /** PayPal webhook event id; primary key makes delivery idempotent. */
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Observability and quotas
// ---------------------------------------------------------------------------

export type ToolChannel = "mcp" | "cart_api" | "panel" | "buyer_agent" | "copilot";

/** Audit log of every agent tool call; doubles as the agent-demand analytics source. */
export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    channel: text("channel").$type<ToolChannel>().notNull(),
    agentClient: text("agent_client"),
    tool: text("tool").notNull(),
    argsDigest: text("args_digest"),
    resultSummary: text("result_summary"),
    createdAt: createdAt(),
  },
  (t) => [index("tool_calls_merchant_created_idx").on(t.merchantId, t.createdAt)],
);

/** Daily usage per LLM provider/model, used to stay inside free-tier quotas. */
export const quotaUsage = pgTable(
  "quota_usage",
  {
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    day: date("day").notNull(),
    requests: integer("requests").notNull().default(0),
    tokens: integer("tokens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.model, t.day] })],
);
