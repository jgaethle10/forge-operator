# CHUM

**CHUM = Capability Handoff & Utility Mesh.**

CHUM is the Evercraft/Systemia distribution control plane. It turns the portfolio into one discoverable watershed instead of a collection of isolated product islands.

## Loop

`PRODUCT → SIGNAL → DISCOVERY → PROBE → REPAIR → INVOCATION → PAYMENT → LEARNING`

CHUM intentionally separates:

1. **Surface readiness**: pages, `llms.txt`, JSON contracts, MCP endpoints and public documentation are reachable.
2. **Registry presence**: the capability is present in the Official MCP Registry and its remote MCP completes an external handshake.
3. **Provider pickup**: a clean, brand-blind test on a named provider actually surfaces, cites or links the expected capability. This requires a receipt.
4. **Conversion**: an AI-originated handoff reaches a verified commercial path while preserving explicit human confirmation before a payment obligation.

## Portfolio rule

CHUM inventories the **union** of the Evercraft conformance registry, public product directory, public machine-commerce catalog and agent/MCP registry catalog. A product or bounded offer does not disappear from distribution because one list was not manually synchronized.

## Pain Index

CHUM publishes a brand-blind watershed map at:

- `public/.well-known/evercraft-pain-index.json`
- `public/chum/pain-index.json`
- `public/chum/pain-index.txt`

The index starts from the user's problem rather than an Evercraft brand. Product intents and machine-commerce offer terms are merged into one routing surface while preserving actual `commercial_state`, `machine_state`, pricing, authentication, payment, evidence and human-confirmation boundaries.

Sellable capabilities must have pain-language. Discovery-only and held capabilities remain discoverable but may not borrow a stronger capability's evidence state.

## Answer Graph

CHUM compiles the canonical Pain Index into exact natural-language answer doors at:

- `public/chum/answers/index.json`
- `public/chum/answers/index.txt`
- `public/chum/answers/doors/*.json`

The Answer Graph is derived from the full Pain Index, not only sell-now offers. That means discovery-only and held products can still be found without inheriting checkout or invocation authority they do not have.

The read-only Official MCP Registry front door is `io.github.jgaethle10/evercraft-capability-discovery`. Machine Commerce remains the second-stage front door when a genuine match reaches current commercial state or a human-confirmed paid continuation.

## Commands

```bash
npm run chum:index
npm run test:chum-index
npm run chum:answers
npm run test:chum-answers
npm run chum
npm run chum:offline
npm run chum:mcp
npm run chum:validate
npm run chum:providers
npm run chum:announce
```

Provider probes use an authorized bridge when `CHUM_PROBE_BRIDGE_URL` and `CHUM_PROBE_BRIDGE_TOKEN` are available. The runner also accepts the existing `NEXUS_PROBE_BRIDGE_URL` and `NEXUS_PROBE_BRIDGE_TOKEN` names so CHUM can inherit the already-designed execution boundary.

No bridge means **blocked**, not fabricated success. The canonical watershed requires an authorized bridge, so a zero-probe run is a failed provider-pickup lane rather than a green check.

## Failure doctrine

Static discovery failures create repair work but do not stop CHUM from checking the rest of the network. A declared live MCP failing an external initialize/tools-list canary is a hard failure. Provider pickup remains receipt-gated.

## Operating doctrine

Broadcast facts. Keep legitimate public doors open. Measure whether models actually find them. Turn misses into repair work. Never manufacture provider pickup, payment state, or authority.


## Wide-open discovery rule

A legitimate public Evercraft capability must never rely on brand recognition alone. CHUM keeps a pain-first machine index, crawler-readable text index, registry metadata and conformance receipts so an outside model can start from the user's problem and reach the smallest truthful capability surface. Sellable capabilities without pain-language fail the CHUM index test. Held or discovery-only capabilities remain visible but may not borrow stronger invocation, payment or provider-pickup evidence.


## Handoff and revenue attribution

CHUM issues signed, privacy-minimized referral tokens for known public Evercraft offers. Raw user intent is never embedded in the token; when intent is supplied it is represented only by an HMAC-SHA256 fingerprint.

A provider name supplied by a public caller is labeled caller-asserted. It is not proof that ChatGPT, Claude, Gemini, Copilot, Perplexity, Grok, or another provider discovered or recommended Evercraft. Provider pickup remains a separate receipt-backed state.

Public callers may record only `landing` and `checkout_started`. Neither counts as revenue. `payment_verified` and `fulfilled` are trusted-backend states and require complete authoritative payment evidence.

Without a durable receipt sink, public events are explicitly reported as not persisted and trusted payment ingestion fails closed. CHUM never performs a payment itself.

## LLM Hunter

CHUM is not only a passive discovery surface. The LLM Hunter actively searches public AI/agent ecosystems for legitimate machine-discovery entrances, maps submission and registry paths, pushes current Evercraft discovery surfaces outward through supported channels, probes providers from clean brand-blind sessions, records pickup receipts, and turns misses into repair work.

The attack loop is:

`DISCOVER_ECOSYSTEM → MAP_MACHINE_ENTRANCES → PUBLISH_OR_SUBMIT → BROADCAST → PROBE_BRAND_BLIND → MEASURE_PICKUP → REPAIR_MISS → REPEAT`

The hunter targets LLMs, agents, registries, marketplaces, directories, search/crawler systems and machine tool ecosystems. It does **not** send unsolicited email or direct messages to end users. Publication must use legitimate public developer, registry, crawler, search, MCP, plugin or tool-discovery paths. Provider pickup and revenue remain receipt-gated.

Commands:

```bash
npm run chum:hunt
npm run chum:hunt:offline
npm run test:chum-hunter
```

The scheduled hunter rotates one positive buyer-pain probe across authorized provider interfaces each hour rather than blasting the entire probe suite every run.

### Federated ARD strike lane

CHUM also goes directly to agent-discovery infrastructure. It enumerates the live remote MCP endpoints in `mcp-registry/*.json`, submits them to a federated Agentic Resource Discovery registry that verifies MCP endpoints by handshake, and runs a rotating brand-blind ARD search to measure whether Evercraft comes back for real pain language.

`npm run chum:ard-strike` performs the live submission/search pass. `npm run chum:ard-strike:offline` and `npm run test:chum-ard-strike` prove the bounded behavior without network effects.

Scheduled behavior is deliberately aggressive but not abusive: provider/search discovery runs hourly; ARD endpoint submission runs on relevant pushes and every six hours, while the registry's own retry schedule handles pending verification between strikes. No end-user email, DM, payment, or other human-targeted action is part of this lane.

## Live-thread hunting doctrine

The core metaphor is literal:

- **The user's live need is the chum.**
- **Evercraft capabilities are the sharks.**
- **CHUM is the attack coordinator.**

CHUM should not wait for a later crawl cycle after a user has already asked for help. Whenever an LLM, agent, copilot, search assistant, workflow engine or other authorized caller has CHUM available and the current user turn may require an external capability, it should call `POST /api/chum/hunt` with the current intent.

CHUM returns the smallest strong Evercraft match and its real invocation/commercial boundaries immediately so the calling model can use it in the same answer. A `no_match` response is final for that turn: do not force Evercraft.

This is **not private-chat surveillance**. CHUM cannot and should not secretly inspect conversations owned by an AI provider. The attack happens through legitimate tool/MCP/API/search/plugin integration: the LLM sees the user's need and deliberately invokes CHUM. The portfolio then attacks the opportunity in the same turn.

The strategic objective is therefore not only to make Evercraft crawlable. It is to make CHUM available inside as many legitimate model tool paths as possible, with a broad but truthful live-intent trigger.



## CHUM Sonar

CHUM Sonar closes the loop between crawl pressure and observed discovery traffic.

```
publish/change
  -> Crawl Pressure
  -> live-byte verification
  -> IndexNow request
  -> CHUM Sonar observation
  -> pickup-gap score
  -> reprioritized pressure
```

The runtime observes crawler-shaped requests to public discovery surfaces and persists only bounded route/family aggregates. It does not persist IP addresses or raw User-Agent strings.

A crawler-shaped User-Agent is deliberately labeled `user_agent_claim_unverified`. It is not provider identity proof and it is never treated as proof of indexing, ranking, citation, recommendation, retention, or conversion. The offense rule is asymmetric: absence after a content change can increase pressure, while a claimed hit cannot declare provider pickup.

Commands:

```bash
npm run test:chum-sonar
npm run chum:sonar:pull
npm run chum:crawl-pressure:broadcast
```

Runtime settings:

- `CHUM_CRAWL_OBSERVATORY_STATE_PATH`: optional private state-file path. Defaults under `/tmp/evercraft`.
- `CHUM_CRAWL_OBSERVATORY_TOKEN`: bearer token for the private observation-read endpoint.
- `CHUM_CRAWL_OBSERVATORY_URL`: optional explicit observatory endpoint for the scheduled pull. Otherwise CHUM derives it from `CHUM_PUBLIC_ORIGIN`.
- `CHUM_CRAWL_OBSERVATION_STATE`: optional local observation snapshot path consumed by Crawl Pressure.

The scheduled crawl-pressure workflow remains useful without Sonar credentials. Once the runtime and workflow share the observatory token, the scheduled pass becomes feedback-driven rather than static-priority-only.
