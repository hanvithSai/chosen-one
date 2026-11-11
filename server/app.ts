import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { Logger } from "pino";
import { cartRoutes } from "./agent-api/cartRoutes.js";
import { paymentRoutes } from "./agent-api/paymentRoutes.js";
import type { CartService } from "./commerce/cart.js";
import { getCatalog } from "./commerce/catalog.js";
import type { CheckoutPolicy } from "./demo/data.js";
import { mcpRoutes } from "./mcp/routes.js";
import { activityRoutes } from "./api/activityRoutes.js";
import type { BuyerAgent } from "./buyer/chitti.js";
import { buyerRoutes } from "./buyer/routes.js";
import { enrichmentRoutes } from "./enrichment/routes.js";
import type { LlmService } from "./ai/llm.js";
import type { PanelService } from "./panel/panelService.js";
import { panelRoutes } from "./panel/routes.js";
import { webhookRoutes } from "./webhooks/routes.js";
import { WebhookService } from "./webhooks/service.js";
import type { WebhookVerifier } from "./webhooks/verifier.js";
import type { AppConfig } from "./config.js";
import type { DbHandle } from "./db/client.js";

const SERVICE_NAME = "chosen-one";

/** Paths handled by the API server; anything else falls through to the web app in production. */
const API_PREFIXES = ["/api", "/mcp", "/merchant-cart", "/paypal", "/webhooks", "/healthz"];

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  database?: Pick<DbHandle, "driver" | "ping"> & Partial<Pick<DbHandle, "db">>;
  /** Agent commerce surface (Cart API v1 + PayPal return pages). */
  commerce?: { cartService: CartService; merchantSlug: string; policy: CheckoutPolicy };
  /** AI shopper panel (dashboard API). Needs the database. */
  panelService?: PanelService;
  /** In-app buyer agent (Chitti). Chat endpoint is served only when present. */
  buyerAgent?: BuyerAgent;
  /** LLM used to draft catalog fixes. */
  llm?: LlmService;
  /** Verifies PayPal webhook signatures. When absent, /webhooks/paypal is not served. */
  webhookVerifier?: WebhookVerifier;
  /** Directory holding the built web app (dist/web). Served only when it exists. */
  webDistDir?: string;
}

export function createApp({
  config,
  logger,
  database,
  commerce,
  webhookVerifier,
  panelService,
  buyerAgent,
  llm,
  webDistDir,
}: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        const request = req as express.Request;
        if (request.originalUrl.startsWith("/webhooks")) request.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get("/healthz", async (_req, res) => {
    const body = { status: "ok", service: SERVICE_NAME, mode: config.DEMO_MODE };
    if (!database) return res.json(body);
    const dbOk = await database.ping();
    res.status(dbOk ? 200 : 503).json({
      ...body,
      status: dbOk ? "ok" : "degraded",
      db: { driver: database.driver, ok: dbOk },
    });
  });

  if (commerce) {
    app.use(
      "/merchant-cart",
      cartRoutes({ cartService: commerce.cartService, storeApiToken: config.STORE_API_TOKEN }),
    );
    app.use("/paypal", paymentRoutes({ cartService: commerce.cartService }));
    if (database?.db) {
      app.use(
        "/mcp",
        mcpRoutes({
          db: database.db,
          cartService: commerce.cartService,
          merchantSlug: commerce.merchantSlug,
          policy: commerce.policy,
          storeApiToken: config.STORE_API_TOKEN,
          logger,
        }),
      );
    }
  }

  if (panelService && database?.db) {
    app.use(
      "/api/panels",
      panelRoutes({
        db: database.db,
        service: panelService,
        merchantSlug: config.MERCHANT_SLUG,
        adminToken: config.STORE_API_TOKEN,
        readOnly: config.DEMO_MODE === "replay",
      }),
    );
  }

  if (database?.db) {
    app.get("/api/store", async (_req, res) => {
      const catalog = await getCatalog(database.db!, config.MERCHANT_SLUG);
      res.json({
        merchant: { name: catalog.merchant.name, tagline: catalog.merchant.tagline },
        catalogVersion: catalog.version.version,
        products: catalog.products.length,
        mode: config.DEMO_MODE,
      });
    });
    app.use(
      "/api/activity",
      activityRoutes({ db: database.db, merchantSlug: config.MERCHANT_SLUG }),
    );
  }

  if (buyerAgent) {
    app.use("/api/chitti", buyerRoutes({ agent: buyerAgent, logger }));
  }

  if (llm && database?.db) {
    app.use(
      "/api/proposals",
      enrichmentRoutes({
        db: database.db,
        llm,
        merchantSlug: config.MERCHANT_SLUG,
        adminToken: config.STORE_API_TOKEN,
        readOnly: config.DEMO_MODE === "replay",
      }),
    );
  }

  if (webhookVerifier && database?.db) {
    app.use(
      "/webhooks",
      webhookRoutes({
        verifier: webhookVerifier,
        service: new WebhookService(database.db, logger),
        logger,
      }),
    );
  }

  if (webDistDir && existsSync(webDistDir)) {
    app.use(express.static(webDistDir, { index: false, maxAge: "1h" }));
    app.get(/.*/, (req, res, next) => {
      if (API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
      res.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "invalid_request", issues: err.issues.map((i) => i.message) });
      return;
    }
    logger.error({ err, path: req.path }, "Unhandled request error");
    res.status(500).json({ error: "internal_error" });
  };
  app.use(errorHandler);

  return app;
}
