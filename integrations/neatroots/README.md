# Evercraft × neatroots: Checkout Evidence Demonstration

**Status:** Two synthetic checkout-agent execution traces, designed around a real Evercraft release principle: a checkout page being reachable is not proof of a payment or delivery. This is a **local demonstration**, not a production Evercraft integration, a paid order, or an assertion that neatroots detected a problem in a live run.

## Why this matters

An AI agent can see HTTP 200 from a checkout page and hallucinate a successful sale. The real authorization boundary is a separate, authoritative provider payment receipt. Here, both scripted agents see exactly the same evidence:

1. Checkout page reachable (HTTP 200), and
2. Provider payment verification failed (no authoritative receipt).

One agent incorrectly tells the user **"Payment confirmed and order fulfilled successfully."** The other reports that **payment is unverified and fulfillment is blocked**. This isolates a failure mode that an agent observability system should help investigate. The final response differs, but the underlying tool evidence does not.

No real payments occur. Both outcomes are predetermined for an inspectable, repeatable fixture. This test **does not prove neatroots correctly detects the contradiction** until the traces are ingested and its relevant checks are observed. Some checks require a configured model.

## Requirements

Node.js 22 or later. No third-party dependencies, account, external API calls, LLM API keys, or private data.

## Run

From the root of the Evercraft Forge Operator repository:

```bash
# Generate two JSONL fixtures; stdout-only, no network:
node integrations/neatroots/checkout-evidence-demo.mjs > /tmp/checkout-evidence.jsonl

# Test the generator, guardrails, and the documented HTTP contract against a local fake collector:
node --test tests/neatroots-checkout-evidence.test.mjs

# Import into a local, separately installed neatroots instance:
neatroots import /tmp/checkout-evidence.jsonl

# OR send to a running local neatroots collector, explicitly opting into localhost HTTP:
node integrations/neatroots/checkout-evidence-demo.mjs --send
```

Open `http://localhost:4100` and select the `evercraft-checkout-evidence-demo` project. Inspect the failed `verify_provider_receipt` tool span in both cases and compare the final answers. Try **Explain run** with a configured local model, and independently verify whether built-in ignored-error/contradiction checks fire; record any false positives or negatives with screenshots and version numbers.

## Privacy and status boundaries

- Every trace has `synthetic: true` and uses only `DEMO-1001` and `example.invalid` identifiers.
- No Systemia records, customer data, real checkout URLs, tokens, or receipts are read or transmitted.
- The sender accepts only an explicit local `http://localhost`, `http://127.0.0.1`, or `http://[::1]` collector origin. It refuses remote/cloud endpoints, embedded credentials, arbitrary paths and URL queries.
- Generating the JSONL requires **no collector**. HTTP test acceptance from a fake server proves only the emission contract, not actual ingestion or detection by neatroots.
- Cloud upload, hosted models, payments, and production routing are **not enabled**.

**Next verification gate:** Run against a real local neatroots release; capture server version, successful ingestion, observed checks and screenshots; then consider contributing a focused upstream check or test fixture if there's a confirmed gap.

Sources: [neatroots HTTP example](https://github.com/neatlogs/neatroots/tree/main/examples/http-api), [checks documentation](https://github.com/neatlogs/neatroots/blob/main/docs/checks.md), [Apache-2.0 upstream](https://github.com/neatlogs/neatroots).
