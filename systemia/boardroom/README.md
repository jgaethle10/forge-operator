# Evercraft Boardroom: private multi-model runtime

This is **a server-only model-to-model orchestration prototype**, not an activated public subscription product.

The customer-facing page is at /public/mesh/ai-boardroom/ and has a free local decision-brief builder, a separate browser-only comparison, and exact existing scoped service checkouts.

## What this engine genuinely performs

1. Two or more separately configured provider APIs independently answer a decision.
2. Each successful provider critiques other providers' viewpoints.
3. A configured chair model synthesizes the responses, preserves dissent and identifies uncertainty.
4. Failures remain visible. Fewer than two independent vendor outputs returns "insufficient_models"; no synthetic votes or fictional providers.

Official adapters are available for OpenAI Chat Completions, Anthropic Messages and Google Gemini generateContent. Supported models and request limits must be chosen from the providers' current published APIs. This engine makes no real external calls without administrator-supplied environment secrets.

## Start locally

Node 22+ required. No third-party packages.

Set at least two different vendor pairs:
- OPENAI_API_KEY and BOARDROOM_OPENAI_MODEL
- ANTHROPIC_API_KEY and BOARDROOM_ANTHROPIC_MODEL
- GOOGLE_API_KEY and BOARDROOM_GOOGLE_MODEL

Also set BOARDROOM_API_ENABLED=1, BOARDROOM_ACCESS_TOKEN (a high-entropy private token), optionally BOARDROOM_PORT and BOARDROOM_ALLOWED_ORIGINS. Keep tokens out of source, browser, logging, URLs and public discovery.

Run: node systemia/boardroom/server.mjs

Private test call:
POST http://127.0.0.1:8766/api/boardroom/run
Authorization: Bearer [the private token]
Content-Type: application/json
Body: {"question":"Should our company expand to a second site next year?"}

GET /health returns only enabled state and configured vendor count.

## Public launch blockers

**Do not expose the shared private bearer token in frontend JavaScript.** Before customer access, integrate authenticated Evercraft customer sessions and verified paid entitlements, server-side quota / costs, per-customer rate limiting, misuse checks, secure job ledger, abuse prevention, retention/erase policy, durable fulfillment records, and live provider tests.

Evercraft Payments must verify purchase authoritatively through trusted webhook/order state. A Stripe checkout URL is not authorization to spend inference budget and not proof of payment.

Model output is not fact verification; no AI synthesis is portrayed as legal, financial, medical or professional advice. No claims of vendor-independent confidence percentages.

Smoke-test the real public domain, webhook handling, and at least one complete authenticated customer order before promoting this runtime to a paid software offer.

Run isolated tests: node --test tests/boardroom-runtime.test.mjs
