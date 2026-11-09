import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { Logger } from "pino";
import type { AppConfig } from "./config.js";

const SERVICE_NAME = "chosen-one";

/** Paths handled by the API server; anything else falls through to the web app in production. */
const API_PREFIXES = ["/api", "/mcp", "/merchant-cart", "/paypal", "/webhooks", "/healthz"];

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  /** Directory holding the built web app (dist/web). Served only when it exists. */
  webDistDir?: string;
}

export function createApp({ config, logger, webDistDir }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: SERVICE_NAME, mode: config.DEMO_MODE });
  });

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
