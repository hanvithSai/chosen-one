import { desc, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";
import { getMerchantBySlug } from "../commerce/catalog.js";
import type { Db } from "../db/client.js";
import { orders, toolCalls } from "../db/schema.js";

export interface ActivityRoutesOptions {
  db: Db;
  merchantSlug: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read-only view of what outside AI agents did in the store: tool calls and paid orders. */
export function activityRoutes({ db, merchantSlug }: ActivityRoutesOptions): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const merchant = await getMerchantBySlug(db, merchantSlug);
    const since = new Date(Date.now() - 7 * DAY_MS);

    const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(20);
    const byTool = await db
      .select({ tool: toolCalls.tool, calls: sql<number>`count(*)::int` })
      .from(toolCalls)
      .where(eq(toolCalls.merchantId, merchant.id))
      .groupBy(toolCalls.tool);
    const byAgent = await db
      .select({ agent: toolCalls.agentClient, calls: sql<number>`count(*)::int` })
      .from(toolCalls)
      .where(eq(toolCalls.merchantId, merchant.id))
      .groupBy(toolCalls.agentClient);
    const recent = await db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.merchantId, merchant.id))
      .orderBy(desc(toolCalls.createdAt))
      .limit(15);
    const [weekly] = await db
      .select({ calls: sql<number>`count(*)::int` })
      .from(toolCalls)
      .where(gte(toolCalls.createdAt, since));

    const captured = orderRows.filter((o) => o.status === "COMPLETED");
    res.json({
      orders: orderRows.map((o) => ({
        paypalOrderId: o.paypalOrderId,
        cartId: o.cartId,
        status: o.status,
        amount: (o.amountCents / 100).toFixed(2),
        currency: o.currency,
        agent: o.agentClient,
        captureId: o.captureId,
        webhookConfirmed: o.webhookConfirmed,
        createdAt: o.createdAt,
      })),
      totals: {
        agentOrders: orderRows.length,
        capturedOrders: captured.length,
        capturedRevenue: (captured.reduce((sum, o) => sum + o.amountCents, 0) / 100).toFixed(2),
        toolCallsLast7Days: weekly?.calls ?? 0,
      },
      toolCalls: {
        byTool: byTool.sort((a, b) => b.calls - a.calls),
        byAgent: byAgent
          .map((a) => ({ agent: a.agent ?? "unknown", calls: a.calls }))
          .sort((a, b) => b.calls - a.calls),
        recent: recent.map((c) => ({
          at: c.createdAt,
          agent: c.agentClient ?? "unknown",
          tool: c.tool,
          channel: c.channel,
        })),
      },
    });
  });

  return router;
}
