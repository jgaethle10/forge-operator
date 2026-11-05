# Duck.ai competitive benchmark → Systemia / Work Saban mission router
**State:** source-backed assessment + engineering specification; **not live competitor or owned-runtime test**  
**Date:** 2026-11-04  
**Tracking:** [#1860](https://github.com/jgaethle10/forge-operator/issues/1860)  
**Authority:** Systemia admission required; this GitHub document does not grant dispatch.

## Executive decision
Duck.ai has a credible multi-model, private conversational entry point. Its documented user experience includes model selection, second opinions, web search, image and voice features, and local/encrypted chat controls. **Our differentiation must be trustworthy work completion**, not merely claims of having more models. Build *provider policy → distinct second opinion → admitted work mission → evidence-bearing result* on top of the already-owned Raven and Saban seams. Do not build a second inference gateway or present static output comparison as authenticated model deliberation.

## Evidence ledger
| Claim | Source | Confidence | Actual measurement? |
| --- | --- | --- | --- |
| Duck.ai offers multiple third-party AI model choices | https://duckduckgo.com/duckduckgo-help-pages/duckai | Vendor-documented | NO |
| Duck.ai supports a model "second opinion", voice, image creation and search | https://duckduckgo.com/updates | Vendor-documented | NO |
| Duck.ai anonymizes requests and has provider ZDR/training limits | https://duckduckgo.com/duckduckgo-help-pages/duckai/ai-chat-privacy | Vendor-documented, subject to listed exceptions | NO independent audit |
| Optional encrypted sync; user-side local storage of recent chats | https://duckduckgo.com/duckai/privacy-terms | Vendor-documented | NO independent audit |
| Duck.ai has lower latency or higher quality than Evercraft | No evidence | UNKNOWN | NO |
| Duck.ai executes durable multi-tool business missions | No evidence | UNKNOWN, do not call it impossible | NO |
| Raven supports a private loopback inference gateway with configured Ollama/Gemini/OpenAI adapters | systemia/raven/README.md | Source documented | NO live run this session |
| Raven provider/model selection currently requires explicit runtime configuration | systemia/organism/raven-inference-gateway.workflow.json | Source documented | NO live run this session |
| Free AI Boardroom compares human-pasted outputs | README.md | Source documented | NO live multi-provider run this session |
| Full authenticated AI Boardroom execution is blocked separately | https://github.com/jgaethle10/forge-operator/issues/1339 | Issue evidence | NO revalidation this session |

**Scope and terms:** This review uses public official documentation and existing owned repository sources. Do not automate Duck.ai UI/API, scrape, proxy consumer access, or integrate an unofficial Duck.ai backend. No purchase, paid inference or marketing claim is authorized by this assessment.

## Product wedge: two visible customer actions
1. **Ask** — quick grounded answer. Show effective model/provider choice, privacy mode, evidence sources and uncertain assertions when appropriate.
2. **Run work** — create a scoped draft mission request. Systemia must approve authority, budget, data scope, tool permissions and release gates. Display actual requested, planned, held, authorized, executed and verified state. A generated answer is not a completed external effect.

The interface should need only the user's task at entry. Advanced provider selection should be optional, not a prerequisite to understanding the product.

## P0: routing policy contract (proposal, not implemented)
An owned policy module returns `eligible` with a narrowly justified route or `held` with explicit reasons. It NEVER chooses credentials or grants external effect authority.

**Inputs**:
- request: `task_id`, `intent`, `task_capabilities[]`, `data_classification` (public/internal/confidential), `local_only`, `user_cloud_consent`, `cost_ceiling_usd`, `max_latency_ms`, `second_opinion_requested`;
- inventory: enumerated *actually installed* `provider_id`, `model_id`, `runtime` (local/cloud), verified `capabilities[]`, `health_observed_at`, `max_input_tokens`, `estimated_cost_usd`, effective retention policy, current credential readiness and regional constraints;
- external effect authorizations: **separate Systemia authorization artifacts**, never supplied as model-generated routing hints.

**Rules** (fail closed):
1. If `local_only=true`, only `runtime=local` inventory entries qualify; never silently fall back to cloud.
2. Confidential data uses a configured authorized local path by default; cloud requires explicit task-specific authorization and a compatible retention/data policy.
3. A provider missing credentials, model availability, required capability, current health evidence, or cost ceiling is ineligible. Missing facts are UNKNOWN, never `false` or `$0`.
4. Prefer explicitly user-selected eligible route; else pick deterministically by suitable privacy policy, budget and measured latency. No silently invented precision. For a tie, choose stable lexical provider/model id.
5. No inference call for inventory/policy preflight. The provider-specific inference gateway owns credential handling, not the router.
6. `second_opinion_requested` requires separate invocation identities and distinct models; different providers preferred. If only one model qualifies, return `second_opinion_unavailable` and explain. Do not synthesize fictitious dissent.
7. Receipts capture `policy_version`, `task_id`, inventory snapshot digest, route rationale, provider/model id, request id, measured tokens/cost when available, `cost_unknown` otherwise; NEVER raw credentials or private prompt text in public artifacts.
8. No routing verdict may confer permission to send messages, deploy, publish, purchase, charge, or mutate accounts.

**Outputs**:
```json
{
  "schema": "evercraft.raven.model-route-decision.v0",
  "status": "eligible | held",
  "reason_codes": [],
  "primary": null,
  "secondary": null,
  "estimated_cost_usd": null,
  "cost_estimate_kind": "unknown | quoted | measured",
  "authority": "read_only_inference_only",
  "inference_performed": false,
  "external_effect_authorized": false
}
```

## November 4 security hardening notes (candidate source contract)
The disconnected prototype at `systemia/raven/benchmarks/model-route-policy.candidate.mjs` is more restrictive than the initial draft. A trusted Evercraft adapter must supply the runtime clock and a metadata-validated inventory. **User content must never be able to set the trusted metadata or evaluation time.** Without those trusted bindings the selector holds.

- Allowed provider/runtime mappings are **only `ollama → local`, `openai → cloud`, `gemini → cloud`**, matching the currently documented Raven v1 adapters. A hosted adapter cannot relabel itself as local.
- Request requires `evaluation_time_ms`, passed by the trusted host clock, and every model entry requires `metadata_checked: true` and `validated_at_ms` within 5 minutes of evaluation. This is *freshness gating*, **not** cryptographic attestation or independent third-party proof.
- Every model entry requires `configured: true`, `healthy: true`, `cost_estimate_kind: quoted|measured`, finite nonnegative `estimated_cost_usd`, `latency_ms` and capabilities. Hosted models also require `credential_ready: true`, `retention_policy_verified: true`, and explicit task consent. Confidential cloud additionally needs specific approval.
- The `eligible` verdict only proposes models. The existing Raven gateway is still configured for a single provider/model. The selector does **not** change that gateway, grant work permission, or perform any inference.
- No provider metadata source is yet wired to this candidate, and the stand-in test inventory is synthetic. Do not describe the model as live or available without separate inventory/runtime receipt.

**Audit distinction:** a local SHA-256 provider receipt confirms internal consistency of recorded bytes; it does not independently authenticate a cloud provider's external work, source accuracy, or a real business outcome. Never call it an independently verified external effect.

## P0: independent second-opinion receipt
- Both providers must actually run, each with a unique invocation ID and preserved exact model identity. Capture disagreements, overlap, missing sources, and minority conclusions without pretending that consensus proves correctness.
- If second run fails or is held, show a one-sided result and `verification_pending`; never manufacture agreement.
- Human-pasted Boardroom answers remain explicitly labelled *comparison of supplied text* until there are two authentic gateway invocation receipts.
- Linking to issue #1339 does NOT assert the original Boardroom runtime is fixed.

## P0: Saban mission boundary
- `User task → Systemia intake/dedup → budget/scope/authority → Raven model route → bounded analysis/review → approved tool execution → independently verified effect receipt → customer result`.
- Keep Systemia mission IDs and approved tools separate from model prompts. Untrusted task content and web pages cannot alter authority, cost budgets or destination permissions.
- If outcome is unknown (for example provider acknowledgment lost), preserve held/quarantine state; never automatically replay non-idempotent actions.
- First proof uses synthetic fixture work with no external effect. Production requires independent signed/authenticated provider evidence and explicit user-authorized external effect admission.

## Benchmark protocol: 10 test cases
Use `duck-ai-benchmark-fixtures-20261104.json` as the machine-readable test index. Test as an ordinary consenting human using allowed product features; **no automated Duck.ai requests**. Retain only rights-cleared synthetic inputs, date, plan, platform, visible output and screenshots with no account secrets; never infer hidden internals.
1. Find the model picker, identify actual provider and model.
2. Compare an initial answer with a second opinion.
3. Ask a sourced current-events question; evaluate source traceability.
4. Provide a deliberately ambiguous business task; test clarification quality.
5. Provide contradictory premises; evaluate uncertainty rather than agreement.
6. Attempt an Excel-friendly calculation; evaluate reproducibility.
7. Request a small document and track useful export semantics.
8. Test privacy controls and clearly communicate optional storage choices.
9. Test refusal/hold behavior for a side-effecting action without granted authority.
10. Attempt a multi-stage business deliverable and inspect actual completion evidence.

### Scoring (no scores until tested)
Dimensions: `onboarding`, `provider_transparency`, `privacy_controls`, `evidence_quality`, `second_opinion_integrity`, `mission_completion`, `latency_ms`, `cost_usd`. Separate vendor-documented features from directly measured results. For each result store `status=not_tested|observed|blocked|not_applicable`, artifact references and evaluation caveats. A provider's text answer is never an external work receipt.

## Release acceptance gates
- Offline policy canary: local-only confidential request never routes to a hosted model; missing credentials/health/budget reject; all unknown cost is unknown; tie is deterministic.
- Multi-model provenance: no second opinion without two actual distinct invocation receipts.
- Side effects: requested/held/executed/verified remain distinct, and provider completion cannot grant action rights.
- Privacy: user-visible provider retention restrictions, explicit cross-boundary consent, no public secrets.
- UX: mobile one-task surface and trustworthy status, no unsupported live-autonomy promises.
- CI: offline route/negative-control tests first. Separately prove a real live provider run before launch.
- Go/no-go: Systemia admission + authorized runtime, true ingress/egress receipts, budget guard, and independently inspected results. GitHub PR/green source tests alone do not satisfy deployment.

## Next owned integration seam
Connect *after* separately authorized review to `systemia/raven/inference-gateway.mjs` and existing Raven `POST /v1/team-review` with the provider-neutral contract; do not create a new public model endpoint. Link to issues #929, #1339 and #1707 for live readiness. Existing free comparison page remains a distinct non-live product.