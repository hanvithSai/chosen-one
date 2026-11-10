import { Router, type Request } from "express";
import type { Logger } from "pino";
import { WebhookService, type PayPalEvent } from "./service.js";
import type { WebhookHeaders, WebhookVerifier } from "./verifier.js";

export interface WebhookRoutesOptions {
  verifier: WebhookVerifier;
  service: WebhookService;
  logger: Logger;
}

function headersFrom(req: Request): WebhookHeaders | undefined {
  const pick = (name: string) => req.get(name) ?? "";
  const headers = {
    authAlgo: pick("paypal-auth-algo"),
    certUrl: pick("paypal-cert-url"),
    transmissionId: pick("paypal-transmission-id"),
    transmissionSig: pick("paypal-transmission-sig"),
    transmissionTime: pick("paypal-transmission-time"),
  };
  return Object.values(headers).every(Boolean) ? headers : undefined;
}

/** PayPal webhook receiver. Needs the exact raw body, captured by the JSON parser in app.ts. */
export function webhookRoutes({ verifier, service, logger }: WebhookRoutesOptions): Router {
  const router = Router();

  router.post("/paypal", async (req, res) => {
    const headers = headersFrom(req);
    const rawBody = req.rawBody?.toString("utf8");
    if (!headers || !rawBody) {
      res.status(400).json({ error: "missing_signature_headers_or_body" });
      return;
    }
    let verified: boolean;
    try {
      verified = await verifier.verify(headers, rawBody);
    } catch (err) {
      // Ask PayPal to retry later rather than silently dropping a genuine event.
      logger.error({ err }, "Webhook verification could not run");
      res.status(503).json({ error: "verification_unavailable" });
      return;
    }
    if (!verified) {
      logger.warn({ transmissionId: headers.transmissionId }, "Rejected unverified webhook");
      res.status(401).json({ error: "invalid_signature" });
      return;
    }
    const event = req.body as PayPalEvent;
    const outcome = await service.handle(event);
    logger.info({ eventId: event.id, type: event.event_type, outcome }, "PayPal webhook handled");
    res.status(200).json({ status: outcome });
  });

  return router;
}
