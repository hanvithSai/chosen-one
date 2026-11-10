import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireBearerToken } from "../agent-api/auth.js";
import { getMerchantBySlug } from "../commerce/catalog.js";
import type { Db } from "../db/client.js";
import { catalogVersions, panels } from "../db/schema.js";
import type { PanelService } from "./panelService.js";
import { summarizePanel } from "./report.js";

export interface PanelRoutesOptions {
  db: Db;
  service: PanelService;
  merchantSlug: string;
  /** Token needed to start a new panel (it spends free-tier LLM quota). Reading is public. */
  adminToken: string;
  /** When true, new panels are refused so a public demo cannot burn quota. */
  readOnly: boolean;
}

const StartSchema = z.object({ label: z.string().min(1).max(60).default("Panel run") });

/** Dashboard API: read panel results, and start a new run (token-protected). */
export function panelRoutes({
  db,
  service,
  merchantSlug,
  adminToken,
  readOnly,
}: PanelRoutesOptions): Router {
  const router = Router();
  let running: string | undefined;

  router.get("/", async (_req, res) => {
    const merchant = await getMerchantBySlug(db, merchantSlug);
    const rows = await db
      .select({ panel: panels })
      .from(panels)
      .innerJoin(catalogVersions, eq(panels.catalogVersionId, catalogVersions.id))
      .where(eq(catalogVersions.merchantId, merchant.id))
      .orderBy(desc(panels.createdAt));
    const summaries = await Promise.all(
      rows.map(({ panel }) => summarizePanel(db, panel.id, merchantSlug)),
    );
    res.json({
      panels: summaries
        .filter((s) => s !== undefined)
        .map(({ results: _results, ...rest }) => rest),
    });
  });

  router.get("/:id", async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return void res.status(404).json({ error: "not_found" });
    const summary = await summarizePanel(db, id, merchantSlug);
    if (!summary) return void res.status(404).json({ error: "not_found" });
    res.json(summary);
  });

  router.post("/", requireBearerToken(adminToken), async (req, res) => {
    if (readOnly) {
      return void res.status(403).json({ error: "read_only", message: "This demo is read-only." });
    }
    if (running) {
      return void res.status(409).json({ error: "panel_running", panelId: running });
    }
    const body = StartSchema.parse(req.body ?? {});
    const { panelId, run } = await service.start({ merchantSlug, label: body.label });
    running = panelId;
    void run().finally(() => {
      running = undefined;
    });
    res.status(202).json({ panelId, status: "queued" });
  });

  return router;
}
