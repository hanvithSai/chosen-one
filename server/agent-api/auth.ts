import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Identifies the calling agent from headers; used for attribution and the tool-call log. */
export function agentClientFrom(req: Request): string | undefined {
  const header = req.get("x-agent-client") ?? req.get("user-agent");
  return header ? header.slice(0, 80) : undefined;
}

/** Requires `Authorization: Bearer <token>` (stand-in for the PayPal-issued JWT in Store Sync). */
export function requireBearerToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.get("authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!presented || !tokensMatch(presented, expected)) {
      res
        .status(401)
        .json({ name: "AUTHENTICATION_FAILURE", message: "Missing or invalid bearer token." });
      return;
    }
    next();
  };
}
