import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { Logger } from "pino";
import { cartRoutes } from "./agent-api/cartRoutes.js";
import { paymentRoutes } from "./agent-api/paymentRoutes.js";
import type { CartService } from "./commerce/cart.js";
import type { CheckoutPolicy } from "./demo/data.js";
import { mcpRoutes } from "./mcp/routes.js";
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
  /** Directory holding the built web app (dist/web). Served only when it exists. */
  webDistDir?: string;
}

export function createApp({ config, logger, database, commerce, webDistDir }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));

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
    logger.error({ err, path: req.path }, "Unhandled request error");
    res.status(500).json({ error: "internal_error" });
  };
  app.use(errorHandler);

  return app;
}
