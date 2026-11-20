# Systemia heartbeat advisory council (Claude + Grok)

**Status:** owned-source integration and offline proof only. This is not a live five-minute dispatch, a provider subscription, a credential enrollment or a spending authorization. Mission control stays Systemia; Raven is the private inference boundary; GitHub records code and receipts, not private customer material.

## Participants and intended jobs

- **Claude / Anthropic:** engineering/code review, requirements, QA, technical writing, design critique and risk review.
- **Grok / xAI:** changing market signals, X/public narrative research, distribution timing, competitive analysis and risk review.
- **Evercraft local inference:** private/restricted information stays local. External providers have no standing authority to view the company's full internal brain or to run consequential actions.
- **AI Boardroom:** existing authenticated multiple-adviser process; Grok can now take an independently configured seat alongside Claude and other vendors.

## Every five minutes: observe for free, ask selectively

The existing KAIDANCE/Systemia heartbeat should export only *admitted, source-backed, privacy-classified changes* as a private mission-delta envelope. Call `planHeartbeatAdvisories` against that sanitized envelope. There are two triggers:

1. `material_change`: new evidence, newly failed CI, an urgent market signal, a deadline change, a customer reply, or a meaningful blocker.
2. `review_due`: bounded periodic specialist review that has a fresh `change_ref`, not the same prompt resent without changes.

No triggering change means `quiet`, **zero** provider calls. The plan includes provider, model, specialist role, mission and evidence references, bounded public-safe brief, cost reservation ceiling, unique idempotency key and hold reasons. The default budget is zero, so integration cannot quietly start spending.

A heartbeat worker MAY call `executeAdvisory` only after it has atomically persisted the unique attempt key, verified cloud-export authorization, available total/day/mission budget, provider key/model metadata and Systemia's accepted mission authority. The existing Raven `createInferenceEngine` performs the request using the Evercraft encrypted credential vault. If a request fails or has an uncertain outcome, the key remains attempted and cannot be replayed automatically. A receipt reports the provider invocation and its status, never an invented success.

### Response lifecycle

`observed -> deduped -> admitted -> planned -> reserved -> advisory_received -> challenged -> actionable_suggestion -> human/systemia-authorized mission`

The model's opinion is **not** automatically a verified fact. Require source confirmation before Journal publication, revenue promises, safety decisions or production deployment. Claude and Grok may propose fixes, not execute mail, spending, shipping, account changes, flight systems, purchases, deployments or customer contact.

## Configuration and privacy

On an Evercraft-owned compute node, separate explicit provider models and API credentials are needed. The Raven local bootstrap accepts `anthropic` or `xai` plus an exact model ID, seals the key into Evercraft's existing encrypted vault using hidden stdin, then validates the model through a metadata-only endpoint. This does **not** send a prompt or confirm paid inference. Never put API keys in GitHub, logs, browser apps, mission JSON, screenshots or a public URL.

Claude uses the official Messages API. Grok uses xAI Responses with `store:false` and **no tools**, to avoid default stored-response behavior. Those settings do not eliminate all provider processing, logs, or contractual retention; inspect the provider's actual data terms and account setting before authorizing sensitive workloads. Cloud work must use a bounded, non-sensitive, evidence-linked brief, not unrestricted internal context.

Official references:
- Claude Messages and tools: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Anthropic model metadata: https://platform.claude.com/docs/en/api/models/retrieve
- xAI Responses: https://docs.x.ai/developers/rest-api-reference/inference/responses
- xAI model metadata: https://docs.x.ai/developers/rest-api-reference/inference/models
- xAI pricing and tool-call billing: https://docs.x.ai/developers/pricing

## Integration work still required before live operation

- Consume the canonical five-minute KAIDANCE/Saban mission-delta stream, not a second independent timer.
- Wire the new private atomic attempt/rolling-budget ledger and heartbeat runner into the resident KAIDANCE-owned mission-delta event stream. It fails closed on stale lock or clock rollback; operational lock recovery and provider 429 backoff still require an authorized runbook.
- Add authorized live provider metadata/inference canaries on owned runtime and measure actual per-request usage/cost.
- Add adviser-suggestion triage to Systemia's existing mission queue and public sanitized heartbeat view without revealing private context.
- Run tests before enabling hosted inference. No third-party application/runtime hosts, no Base44 and no unsanctioned consumer-site automation.

## Private runner prepared (OFF by default)

An owned private operator can generate a mode-0600 mission delta file with schema `evercraft.systemia.private-mission-delta.v1`, `origin: systemia-admitted`, and `missions` containing only pre-authorized cloud-safe entries. Use:

```bash
export SYSTEMIA_ADVISORY_MISSION_PACKET_FILE=/private/systemia/mission-delta.json
export SYSTEMIA_ADVISORY_LEDGER_DIR=/private/systemia/advisory-ledger
export RAVEN_PROVIDER_CREDENTIAL_STATE_DIR=/private/evercraft/provider-credentials
export SYSTEMIA_ADVISOR_ANTHROPIC_MODEL=<exact-authorized-model-id>
export SYSTEMIA_ADVISOR_XAI_MODEL=<exact-authorized-model-id>
export SYSTEMIA_ADVISOR_ANTHROPIC_EST_COST_CENTS=<conservative-quoted-call-ceiling>
export SYSTEMIA_ADVISOR_XAI_EST_COST_CENTS=<conservative-quoted-call-ceiling>
export SYSTEMIA_ADVISORY_ROLLING_BUDGET_CENTS=0
node systemia/mission-bridge/model-council/heartbeat-runner.mjs
```

No inference occurs until a valid private packet and keys are present, the rolling budget is nonzero, and `SYSTEMIA_ADVISORY_EXECUTE=1` is explicitly set by the authorized owned supervisor. This environment variable is intentionally **not** set by source or tests. The default command is dry-run, not a live mission. The runner prints only a sanitized summary, never private briefs or model advice.

Offline check:

`node --test systemia/mission-bridge/model-council/heartbeat-advisory.test.mjs systemia/raven/inference-gateway.test.mjs systemia/raven/seal-inference-key.test.mjs systemia/evercraft-home/provider-credentials.test.mjs tests/boardroom-runtime.test.mjs`

**Proof boundary:** source commits and test runs are not proof that Node001 or Node002 has received this branch, that the five-minute heartbeat invokes any vendor, or that any paid inference has succeeded.
