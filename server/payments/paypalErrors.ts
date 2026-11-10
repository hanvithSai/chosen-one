import { ApiError } from "@paypal/paypal-server-sdk";

/** Error body returned by PayPal REST APIs. Field names keep PayPal's own snake_case spelling. */
interface PayPalErrorPayload {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string }[];
}

/**
 * A PayPal API failure normalised for our code. Always carries the debug_id PayPal support asks
 * for, and exposes the specific issue codes (for example INSTRUMENT_DECLINED).
 */
export class PayPalApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorName: string,
    message: string,
    readonly issues: string[],
    readonly debugId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }

  get isDeclined(): boolean {
    return this.issues.includes("INSTRUMENT_DECLINED");
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get isTransient(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

function parsePayload(error: ApiError): PayPalErrorPayload {
  if (error.result && typeof error.result === "object") return error.result as PayPalErrorPayload;
  // A bare ApiError carries the unparsed body only.
  try {
    return JSON.parse(String(error.body)) as PayPalErrorPayload;
  } catch {
    return {};
  }
}

/** Converts an SDK ApiError into a PayPalApiError; leaves every other error untouched. */
export function toPayPalError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const payload = parsePayload(error);
  const retryAfter = Number(error.headers["retry-after"]);
  return new PayPalApiError(
    error.statusCode,
    payload.name ?? "UNKNOWN_ERROR",
    payload.message ?? error.message,
    (payload.details ?? []).map((d) => d.issue).filter((i): i is string => Boolean(i)),
    payload.debug_id ?? error.headers["paypal-debug-id"],
    Number.isFinite(retryAfter) ? retryAfter : undefined,
  );
}
