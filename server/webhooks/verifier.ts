import type { Logger } from "pino";
import type { AppConfig } from "../config.js";

/** The five transmission headers PayPal signs every webhook delivery with. */
export interface WebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export interface WebhookVerifier {
  /** True only when PayPal confirms the signature. `rawBody` must be the exact bytes received. */
  verify(headers: WebhookHeaders, rawBody: string): Promise<boolean>;
}

const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  production: "https://api-m.paypal.com",
} as const;

export interface PayPalVerifierOptions {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  environment: "sandbox" | "production";
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** Verifies webhooks with PayPal's `POST /v1/notifications/verify-webhook-signature`. */
export class PayPalWebhookVerifier implements WebhookVerifier {
  private token?: { value: string; expiresAt: number };
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: PayPalVerifierOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private get base(): string {
    return API_BASE[this.options.environment];
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString(
      "base64",
    );
    const res = await this.fetchImpl(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal token request failed with status ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async verify(headers: WebhookHeaders, rawBody: string): Promise<boolean> {
    // The event is embedded as the exact received text: re-serialising it can break the signature.
    const body =
      `{"auth_algo":${JSON.stringify(headers.authAlgo)},` +
      `"cert_url":${JSON.stringify(headers.certUrl)},` +
      `"transmission_id":${JSON.stringify(headers.transmissionId)},` +
      `"transmission_sig":${JSON.stringify(headers.transmissionSig)},` +
      `"transmission_time":${JSON.stringify(headers.transmissionTime)},` +
      `"webhook_id":${JSON.stringify(this.options.webhookId)},` +
      `"webhook_event":${rawBody}}`;
    const res = await this.fetchImpl(`${this.base}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      this.options.logger?.warn(
        { status: res.status, debugId: res.headers.get("paypal-debug-id") },
        "PayPal webhook verification call failed",
      );
      return false;
    }
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  }
}

/** Real verifier when credentials and a webhook id are configured; otherwise none. */
export function createWebhookVerifier(
  config: AppConfig,
  logger?: Logger,
): WebhookVerifier | undefined {
  if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET || !config.PAYPAL_WEBHOOK_ID) {
    logger?.warn("PAYPAL_WEBHOOK_ID not set; /webhooks/paypal is disabled");
    return undefined;
  }
  return new PayPalWebhookVerifier({
    clientId: config.PAYPAL_CLIENT_ID,
    clientSecret: config.PAYPAL_CLIENT_SECRET,
    webhookId: config.PAYPAL_WEBHOOK_ID,
    environment: config.PAYPAL_ENV,
    logger,
  });
}
