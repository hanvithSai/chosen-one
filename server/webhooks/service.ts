import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { Db } from "../db/client.js";
import { orders, webhookEvents } from "../db/schema.js";

export interface PayPalEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

/** Records verified PayPal events once and applies them to the order ledger. */
export class WebhookService {
  constructor(
    private readonly db: Db,
    private readonly logger?: Logger,
  ) {}

  async handle(event: PayPalEvent): Promise<WebhookOutcome> {
    const inserted = await this.db
      .insert(webhookEvents)
      .values({ id: event.id, eventType: event.event_type, verified: true, payload: event })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return "duplicate";

    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const captureId = event.resource?.id;
    if (!orderId) return "ignored";

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        return this.update(orderId, {
          webhookConfirmed: true,
          status: "COMPLETED",
          ...(captureId ? { captureId } : {}),
        });
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        return this.update(orderId, { status: "DECLINED" });
      case "PAYMENT.CAPTURE.REFUNDED":
        return this.update(orderId, { status: "REFUNDED" });
      default:
        return "ignored";
    }
  }

  private async update(
    orderId: string,
    values: Partial<typeof orders.$inferInsert>,
  ): Promise<WebhookOutcome> {
    const updated = await this.db
      .update(orders)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(orders.paypalOrderId, orderId))
      .returning({ id: orders.paypalOrderId });
    if (updated.length === 0) {
      this.logger?.warn({ orderId }, "Webhook referenced an order this store does not know");
      return "ignored";
    }
    return "processed";
  }
}
