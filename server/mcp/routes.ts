import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router } from "express";
import type { Logger } from "pino";
import { agentClientFrom, requireBearerToken } from "../agent-api/auth.js";
import type { CartService } from "../commerce/cart.js";
import type { Db } from "../db/client.js";
import type { CheckoutPolicy } from "../demo/data.js";
import { createMcpServer } from "./server.js";

export interface McpRoutesOptions {
  db: Db;
  cartService: CartService;
  merchantSlug: string;
  policy: CheckoutPolicy;
  storeApiToken: string;
  logger: Logger;
}

/** MCP endpoint (streamable HTTP, stateless): one server instance per request. */
export function mcpRoutes(options: McpRoutesOptions): Router {
  const router = Router();
  router.use(requireBearerToken(options.storeApiToken));

  router.post("/", async (req, res) => {
    const server = createMcpServer({
      db: options.db,
      cartService: options.cartService,
      merchantSlug: options.merchantSlug,
      policy: options.policy,
      agentClient: agentClientFrom(req),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      options.logger.error({ err }, "MCP request failed");
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: unknown, res: import("express").Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This endpoint is stateless: use POST." },
      id: null,
    });
  };
  router.get("/", methodNotAllowed);
  router.delete("/", methodNotAllowed);

  return router;
}
