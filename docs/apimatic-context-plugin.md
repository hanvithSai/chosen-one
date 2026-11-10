# How we used the APIMatic Context Plugin

ChosenOne's PayPal integration was written with an AI coding agent that had two plugins installed:

- **APIMatic Context Plugin for the PayPal Server SDK:** `paypal@context-plugins-local` v0.1.0, installed with:

  ```
  npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
  ```

- **PayPal AI-Toolkit:** plugin v1.2.0 (https://github.com/paypal/AI-Toolkit).

The plugin gives the coding agent accurate, versioned knowledge of the APIMatic-generated `@paypal/paypal-server-sdk`. That covers client initialization, OAuth client-credentials, controllers and models, error types, and retry configuration. The agent uses this instead of guessing from training data.

## Skills used and where

The PayPal checkout gateway was built with the plugin's TypeScript skills loaded, in the workflow order the plugin itself prescribes. Each skill changed what was written:

| Plugin skill | What it changed in our code | Files |
|---|---|---|
| `typescript-getting-started` | Pinned `@paypal/paypal-server-sdk` to the exact version `2.5.0` and read the SDK source in place to confirm every signature (Orders controller, models, enums) | `package.json`, `server/payments/paypalGateway.ts` |
| `typescript-client-initialization` | One long-lived `Client` built with `Environment.Sandbox`, reused for the process lifetime so the OAuth token is cached; controllers are constructed by us (`new OrdersController(client)`), not read off the client | `server/payments/paypalGateway.ts` |
| `typescript-authentication` | Client-credentials auth set through the generated `clientCredentialsAuthCredentials` object (`oAuthClientId`, `oAuthClientSecret`); the skill's warnings about the credentials property name (it is not named after the scheme) | `server/payments/paypalGateway.ts` |
| `typescript-calling-endpoints` | Calls use the SDK's single options-object form (`createOrder({ body, paypalRequestId, prefer })`, `captureOrder({ id, ... })`) and read payloads from `response.result`; request models use the SDK's camelCase interfaces and enums | `server/payments/paypalGateway.ts` (`buildOrderRequest`) |
| `typescript-error-handling` | Typed `ApiError` handling: payloads on `err.result`, a fallback to the raw `err.body` for bare errors, and PayPal's snake_case field names (`debug_id`, `details[].issue`) kept as-is; errors are normalised to our `PayPalApiError` | `server/payments/paypalErrors.ts` |

## Findings that shaped the design

Reading the SDK source (as the plugin instructs) showed two defaults that matter for payments, and the code handles both explicitly:

- **Retries are off by default and never apply to POST** (`maxNumberOfRetries: 0`, `httpMethodsToRetry: ['GET', 'PUT']`). The gateway therefore retries HTTP 429 and 5xx itself with exponential backoff and honours `Retry-After`. Every retry reuses the same `PayPal-Request-Id`, so a retry can never create a second order.
- **Error payloads are not camelCased**, unlike models. The error mapper reads `debug_id` and `details[].issue` at PayPal's own spelling, which is how `INSTRUMENT_DECLINED` and `ORDER_ALREADY_CAPTURED` are recognised.

The PayPal AI-Toolkit's `paypal-best-practices` checklist was used as the acceptance list: idempotency keys on all POSTs, server-side order creation, 422 `INSTRUMENT_DECLINED` handling, backoff on 429, `debug_id` logging, and sandbox-only configuration.

## Verified against the PayPal sandbox

An order created through this gateway was approved by a sandbox buyer and captured (`COMPLETED`). Capturing it a second time returned the same capture ID rather than a duplicate. Unit tests cover the retry, decline, already-captured and pending paths with a stubbed Orders controller (`tests/server/paypalGateway.test.ts`).

## Evidence

Screenshots of the plugins installed, and of skill invocations during the build, are kept in [docs/images/](images/).
