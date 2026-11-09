CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"status" text NOT NULL,
	"validation_status" text NOT NULL,
	"body" jsonb NOT NULL,
	"agent_client" text,
	"paypal_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"store_label" text NOT NULL,
	"external_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "considerations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"store" text NOT NULL,
	"product_ref" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text,
	"reason_category" text
);
--> statement-breakpoint
CREATE TABLE "intent_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"persona" text,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assigned_model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"query_set" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"paypal_merchant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"paypal_order_id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"custom_id" text NOT NULL,
	"agent_client" text,
	"capture_id" text,
	"debug_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"webhook_confirmed" boolean DEFAULT false NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"intent_set_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"recorded" boolean DEFAULT false NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"line" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stock" integer NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_note_id" uuid,
	"quote" text,
	"reason_category" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quota_usage_provider_model_day_pk" PRIMARY KEY("provider","model","day")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panel_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"model" text NOT NULL,
	"outcome" text NOT NULL,
	"chosen_store" text,
	"chosen_product_ref" text,
	"rationale" text,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"channel" text NOT NULL,
	"agent_client" text,
	"tool" text NOT NULL,
	"args_digest" text,
	"result_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_catalog_version_id_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."catalog_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_versions" ADD CONSTRAINT "catalog_versions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "considerations" ADD CONSTRAINT "considerations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_sets" ADD CONSTRAINT "intent_sets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intents" ADD CONSTRAINT "intents_intent_set_id_intent_sets_id_fk" FOREIGN KEY ("intent_set_id") REFERENCES "public"."intent_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_catalog_version_id_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."catalog_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_intent_set_id_intent_sets_id_fk" FOREIGN KEY ("intent_set_id") REFERENCES "public"."intent_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_catalog_version_id_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."catalog_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_source_note_id_source_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."source_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_notes" ADD CONSTRAINT "source_notes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_versions_merchant_version_uq" ON "catalog_versions" USING btree ("merchant_id","version");--> statement-breakpoint
CREATE INDEX "competitor_products_snapshot_idx" ON "competitor_products" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "considerations_run_idx" ON "considerations" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intents_set_position_uq" ON "intents" USING btree ("intent_set_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "products_version_sku_uq" ON "products" USING btree ("catalog_version_id","sku");--> statement-breakpoint
CREATE INDEX "proposals_product_idx" ON "proposals" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "runs_panel_idx" ON "runs" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "tool_calls_merchant_created_idx" ON "tool_calls" USING btree ("merchant_id","created_at");