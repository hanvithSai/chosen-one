import type { Logger } from "pino";
import type { AppConfig } from "../config.js";
import { FakePaymentGateway, type PaymentGateway } from "./gateway.js";
import { PayPalGateway } from "./paypalGateway.js";

/** Uses PayPal when credentials are configured; otherwise the offline gateway. */
export function createGateway(
  config: AppConfig,
  brandName: string,
  logger?: Logger,
): PaymentGateway {
  if (config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET) {
    if (config.PAYPAL_ENV === "production") {
      throw new Error("Refusing to start with PAYPAL_ENV=production: this build is sandbox-only.");
    }
    return new PayPalGateway({
      clientId: config.PAYPAL_CLIENT_ID,
      clientSecret: config.PAYPAL_CLIENT_SECRET,
      environment: config.PAYPAL_ENV,
      brandName,
      logger,
    });
  }
  logger?.warn("PayPal credentials not set; using the offline payment gateway");
  return new FakePaymentGateway();
}
