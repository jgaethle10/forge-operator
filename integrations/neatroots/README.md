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

**New verified transport receipt (October 16, 2026):** [An isolated GitHub Actions run](https://github.com/jgaethle10/forge-operator/actions/runs/38984442216) installed the pinned genuine neatroots v0.2.8 release, started the local collector, and received HTTP 200 for BOTH synthetic traces. The local tests still separately validate the mock-collector contract. This confirms real collector acceptance, **not** that neatroots detected the contradictory answer, chose a check, or evaluated a model. No tokens, real orders, cloud forwarding, or production services were involved.

**Next verification gate:** Independently observe neatroots rules or configured decision-model findings on both real traces, with trace IDs, version, check configuration and screenshot evidence; then consider a focused upstream contribution if a confirmed gap exists.

Sources: [neatroots HTTP example](https://github.com/neatlogs/neatroots/tree/main/examples/http-api), [checks documentation](https://github.com/neatlogs/neatroots/blob/main/docs/checks.md), [Apache-2.0 upstream](https://github.com/neatlogs/neatroots).

## Additional execution proof: ambiguous external effects

The companion [synthetic recovery simulator](./ambiguous-external-effect.mjs) goes beyond comparing scripted final answers. It models a **state-changing provider** that commits a synthetic payment effect and then loses its acknowledgment; the agent must either query the provider for the authoritative receipt, keep fulfillment blocked when lookup fails, or retry with the **same** stable idempotency key. Distinct request payloads cannot silently reuse a key.

- Run: `node --test tests/ambiguous-external-effect.test.mjs`
- Generate 3 trace records: `node integrations/neatroots/ambiguous-external-effect.mjs`
- [CI receipt](https://github.com/jgaethle10/forge-operator/actions/runs/38995426901): all **19** combined isolated tests passed, and the real local neatroots v0.2.8 collector accepted 5 total synthetic traces, including all 3 recovery scenarios, with HTTP 200 each.
- Safety: a deterministic in-memory fake provider; **zero real charges or irreversible external actions**. The invariant `providerEffects === 1` is tested across lost-ack and idempotent retry cases.
- Limit: a local in-memory simulator cannot prove cross-process database durability, race-free distributed payment reconciliation, or neatroots' ability to diagnose the scenario. These remain future engineering/evaluation gates.
