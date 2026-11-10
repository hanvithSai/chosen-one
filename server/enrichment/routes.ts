import { Router } from "express";
import { z } from "zod";
import { requireBearerToken } from "../agent-api/auth.js";
import type { LlmService } from "../ai/llm.js";
import type { Db } from "../db/client.js";
import { approveProposals, rejectProposals } from "./apply.js";
import { generateProposals, listProposals } from "./propose.js";

export interface EnrichmentRoutesOptions {
  db: Db;
  llm: LlmService;
  merchantSlug: string;
  adminToken: string;
  readOnly: boolean;
}

const IdsSchema = z.object({ ids: z.array(z.uuid()).optional() });

/** Catalog fix proposals: list them (public), draft, approve and reject them (token). */
export function enrichmentRoutes({
  db,
  llm,
  merchantSlug,
  adminToken,
  readOnly,
}: EnrichmentRoutesOptions): Router {
  const router = Router();
  const admin = requireBearerToken(adminToken);

  router.get("/", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ proposals: await listProposals(db, merchantSlug, status) });
  });

  router.use((req, res, next) => {
    if (readOnly && req.method !== "GET") {
      return void res.status(403).json({ error: "read_only", message: "This demo is read-only." });
    }
    next();
  });

  router.post("/generate", admin, async (_req, res) => {
    res.status(201).json(await generateProposals(db, llm, merchantSlug));
  });

  router.post("/approve", admin, async (req, res) => {
    const { ids } = IdsSchema.parse(req.body ?? {});
    res.json(await approveProposals(db, merchantSlug, ids));
  });

  router.post("/reject", admin, async (req, res) => {
    const { ids } = IdsSchema.parse(req.body ?? {});
    res.json({ rejected: await rejectProposals(db, ids ?? []) });
  });

  return router;
}
