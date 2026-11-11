import { Router } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import { QuotaExceededError } from "../ai/quota.js";
import type { BuyerAgent } from "./chitti.js";

/** Allows `max` hits per key inside a sliding window. In memory, which is enough for one server. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true and records the hit if allowed. */
  take(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(12),
});

export interface BuyerRoutesOptions {
  agent: BuyerAgent;
  logger: Logger;
  /** Chats allowed per visitor per hour (each chat spends free-tier model quota). */
  perVisitorPerHour?: number;
  /** Chats allowed per day across all visitors. */
  perDay?: number;
}

/** Public chat endpoint for Chitti, the in-app buyer agent. */
export function buyerRoutes({
  agent,
  logger,
  perVisitorPerHour = 8,
  perDay = 150,
}: BuyerRoutesOptions): Router {
  const router = Router();
  const visitors = new RateLimiter(perVisitorPerHour, 60 * 60 * 1000);
  const everyone = new RateLimiter(perDay, 24 * 60 * 60 * 1000);

  router.post("/", async (req, res) => {
    const body = BodySchema.parse(req.body ?? {});
    if (body.messages.at(-1)?.role !== "user") {
      return void res.status(400).json({ error: "last_message_must_be_from_user" });
    }
    const visitor = req.ip ?? "unknown";
    if (!visitors.take(visitor) || !everyone.take("all")) {
      return void res.status(429).json({
        error: "busy",
        message:
          "Chitti has reached the free-tier chat limit for now. Try again later, or connect your own agent from the Connect tab.",
      });
    }
    try {
      res.json(await agent.chat(body.messages));
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return void res.status(429).json({
          error: "busy",
          message: "The free AI models are at their limit right now. Please try again in a minute.",
        });
      }
      logger.error({ err }, "Chitti chat failed");
      res.status(502).json({
        error: "agent_failed",
        message: "Chitti could not complete that request. Please try again.",
      });
    }
  });

  return router;
}
