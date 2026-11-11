import { Router } from "express";
import { CartError, type CartService } from "../commerce/cart.js";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#fbf6f1;color:#1f1b16;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;border:1px solid #f3e6d8;border-radius:16px;padding:32px;max-width:460px}h1{margin-top:0;font-size:1.4rem}code{background:#f3e6d8;padding:2px 6px;border-radius:6px}</style></head>
<body><main>${body}</main></body></html>`;
}

/** Where shoppers land after approving (or cancelling) on PayPal. */
export function paymentRoutes({ cartService }: { cartService: CartService }): Router {
  const router = Router();

  router.get("/return", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      res.status(400).send(page("Missing order", "<h1>Missing PayPal order token</h1>"));
      return;
    }
    try {
      const { cart, order } = await cartService.completeByOrderId(token);
      const ids = `<p>PayPal order <code>${escapeHtml(order.paypalOrderId)}</code><br>Capture <code>${escapeHtml(order.captureId ?? "pending")}</code></p>`;
      const cartRef = `<code>${escapeHtml(cart.id ?? "")}</code>`;
      if (order.status === "COMPLETED") {
        res.send(
          page(
            "Payment complete",
            `<h1>Payment complete ✓</h1><p>Your order is confirmed. You can return to your AI assistant; it can check the order status for cart ${cartRef}.</p>${ids}`,
          ),
        );
      } else {
        // PayPal accepted the payment but has not cleared it yet (for example a bank-funded
        // payment). Say so, rather than calling it complete.
        res.send(
          page(
            "Payment received",
            `<h1>Payment received, clearing</h1><p>PayPal accepted your approval and is clearing the payment (bank-funded payments can take a few days). The order for cart ${cartRef} is confirmed once it clears.</p>${ids}`,
          ),
        );
      }
    } catch (err) {
      if (err instanceof CartError) {
        res
          .status(err.status)
          .send(
            page(
              "Payment problem",
              `<h1>Payment not completed</h1><p>${escapeHtml(err.message)}</p>`,
            ),
          );
        return;
      }
      throw err;
    }
  });

  router.get("/cancel", (_req, res) => {
    res.send(
      page(
        "Checkout cancelled",
        "<h1>Checkout cancelled</h1><p>No payment was taken. You can return to your AI assistant.</p>",
      ),
    );
  });

  return router;
}
