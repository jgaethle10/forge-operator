# Devpost Draft · Checkout Black Box

## One-line pitch

Checkout Black Box is an agentic-commerce flight recorder that proves what the AI proposed, what the human authorized, and what PayPal actually settled.

## Problem

AI shopping agents can fail in a uniquely dangerous way: they can remain semantically close to a user's request while drifting on amount, currency, recurrence, merchant, or item before money moves. Traditional payment logs tell you what settled. They do not preserve the exact boundary of what the human authorized the agent to do.

## Solution

Checkout Black Box creates a cryptographically bound authorization envelope between AI intent and PayPal transaction truth.

Flow:

1. AI converts a natural-language purchase request into a narrow proposal.
2. Runtime guardrails enforce hard human constraints such as maximum spend and currency.
3. An explicit human confirmation signs the exact proposal hash.
4. PayPal Sandbox Orders v2 creates the order from those authorized values.
5. Before capture, the current PayPal order is reconciled against the authorization.
6. Capture requires another explicit confirmation.
7. The completed PayPal response is reconciled again before payment is marked verified.

If amount, currency, or proposal identity drifts, the system fails closed.

## Why PayPal is central

PayPal is not a decorative checkout button. The project depends on PayPal's OAuth, Orders API, payer approval state, capture flow, and authoritative transaction payload to prove whether an agent stayed inside its human-granted authority.

## Prize fit

- Grand prize
- Best Use of PayPal + AI
- Best Use of Agentic Commerce
- Most Impactful
- Most Creative

## Competition-period update

Evercraft Payments existed before the submission period as a provider-neutral economic routing concept. Checkout Black Box is a new competition-specific standalone implementation created after October 1, 2026. It introduces the AI intent parser, signed human authorization contract, PayPal sandbox order/capture adapter, drift reconciliation, two-stage confirmation flow, browser demo, and judge-runnable open-source package.

## Checklist

- [x] AI purchase-intent proposal
- [x] Human hard-limit enforcement
- [x] Signed authorization envelope
- [x] PayPal Sandbox OAuth adapter
- [x] PayPal Orders v2 create/get/capture adapter
- [x] Reconciliation against human authorization
- [x] Second confirmation before capture
- [x] Browser demo
- [x] Tests with mocked AI + PayPal
- [x] MIT extraction boundary
- [ ] PayPal sandbox credentials provisioned
- [ ] Live PayPal sandbox canary passed
- [ ] Hosted demo verified
- [ ] Dedicated public repository created
- [ ] <3 minute YouTube demo recorded
- [ ] Devpost terms / representative attestation completed
- [ ] Final submission receipt recorded
