# How we used the APIMatic Context Plugin

ChosenOne's PayPal integration was written by Claude Code (Anthropic) with two plugins installed:

- **APIMatic Context Plugin for the PayPal Server SDK:** `paypal@context-plugins-local` v0.1.0, installed with:

  ```
  npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
  ```

- **PayPal AI-Toolkit:** `paypal@claude-plugins-official` v1.2.0.

The plugin gives the coding agent accurate, versioned knowledge of the APIMatic-generated `@paypal/paypal-server-sdk`. That covers client initialization, OAuth client-credentials, controllers and models, error types, and retry configuration. The agent uses this instead of guessing from training data.

## Skills used and where

| Plugin skill | Used for | Files |
|---|---|---|
| _filled in as the integration is built_ | | |

## Evidence

Screenshots of the plugins installed, and of skill invocations during the build, are kept in [docs/images/](images/).
