# Checkout Black Box

Checkout Black Box is an agentic-commerce trust layer built for the 2026 PayPal AI Hackathon.

**The question it answers:** what did the AI intend to buy, what did the human actually authorize, and what did PayPal actually settle?

## Why this exists

Agentic checkout creates a new failure mode: an AI can understand the general shopping goal while drifting on amount, currency, recurrence, merchant, or item by the time a transaction reaches a payment rail.

Checkout Black Box separates four states:

1. **AI proposal** — an AI model turns natural-language intent into a narrow purchase proposal.
2. **Human authorization** — the exact proposal is signed only after an explicit confirmation.
3. **PayPal order** — the PayPal Sandbox Orders API creates the transaction from the authorized values.
4. **Settlement reconciliation** — PayPal's authoritative order/capture payload is compared with the human authorization before payment is called verified.

The AI never gets silent purchasing authority.

## Demo flow

Example intent:

> Pay Evercraft LLC $49 once for a Quick Win Audit. Do not spend more than $49.

The AI may propose a one-time USD 49 transaction, but runtime code enforces the human hard maximum and currency. Clicking **Authorize** signs the exact proposal and creates a PayPal sandbox order. The user approves that order on PayPal. Clicking **Capture** rechecks the authorization, captures through PayPal, and only records payment as verified when the PayPal response still matches.

Try changing the proposal amount after authorization in code or in a test. The order is blocked before PayPal is called.

## Run

Requires Node.js 22+, an OpenAI-compatible AI endpoint, PayPal Sandbox credentials, and a local signing key.

```bash
export AI_API_KEY="..."
export AI_MODEL="your-model"
export PAYPAL_CLIENT_ID="..."
export PAYPAL_CLIENT_SECRET="..."
export CHECKOUT_BLACK_BOX_SIGNING_KEY="use-a-long-random-local-secret"
npm test
npm start
```

Optional:

```bash
export AI_API_BASE_URL="https://api.openai.com/v1"
export PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"
export PORT=8080
```

Open http://localhost:8080.

## PayPal integration

Checkout Black Box uses the PayPal sandbox OAuth and Orders v2 flow:

- `POST /v1/oauth2/token`
- `POST /v2/checkout/orders`
- `GET /v2/checkout/orders/{id}`
- `POST /v2/checkout/orders/{id}/capture`

PayPal's order/capture data is the provider-visible transaction truth. A local proposal, authorization, redirect, or order creation is never treated as payment proof.

## Safety and evidence boundary

- AI cannot raise the operator-supplied hard maximum.
- AI cannot change the operator-supplied currency.
- Human authorization signs the exact proposal hash.
- Proposal tampering invalidates authorization.
- PayPal amount/currency drift fails reconciliation.
- Capture requires a second explicit confirmation.
- No credential values are returned to the browser.
- Checkout creation is not revenue.
- Payment is verified only from a reconciled PayPal completion response.

## Competition packaging

This directory is intentionally self-contained and MIT licensed so it can be extracted into a dedicated public repository without relicensing the wider Evercraft monorepo.
