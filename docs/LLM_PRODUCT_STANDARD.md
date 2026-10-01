# Evercraft LLM Product Standard

Status: company-wide release doctrine  
Owner: Systemia  
Mission: every useful Evercraft capability must be discoverable, understandable, trustworthy, appropriately invokable, and verifiable by humans and machines.

## 1. Scope

This standard applies to every Evercraft product, service, internal tool, research system, API, dataset, workflow, agent, media system, experimental build, historically touched project, and reusable capability. Age, priority, commercial status, or current polish are not grounds for silent exclusion.

The inventory universe is the union of:

1. canonical public product records;
2. private/historical estate archaeology snapshots;
3. repository-backed Systemia modules and registries;
4. plugin and MCP packages;
5. workflows and reusable automation surfaces;
6. datasets, ledgers, indexes, catalogs, snapshots, and registries with reusable value;
7. explicit historical seeds maintained by Systemia when a useful capability is known but not otherwise machine-enumerable.

Nothing may be marked live merely because it has documentation.

## 2. Canonical identity

Every registry entry has a stable ID. Names and brands may change without changing the stable identity.

Preferred identity forms:

- `product:<product_key>`
- `platform:<slug>`
- `capability:<slug>`
- `plugin:<slug>`
- `mcp:<slug>`
- `workflow:<slug>`
- `dataset:<slug>`
- `internal:systemia:<slug>`
- `historical:<slug>`

Aliases are first-class. Problem-first discovery must not depend on the user knowing the brand name.

## 3. Required product record

A fully converted product/capability record must resolve the following fields without invention:

- stable identity and canonical name;
- aliases and problem-language phrases;
- current lifecycle state;
- verified live capabilities;
- declared/planned capabilities kept separate from verified capabilities;
- human URL or explicit reason no human UI is required;
- machine endpoint(s) with protocol and route state;
- authentication/authorization model;
- required permissions/scopes;
- structured input contract;
- structured output contract;
- evidence/provenance model;
- confidence/uncertainty semantics where relevant;
- timestamp/freshness semantics where relevant;
- receipt/idempotency behavior where relevant;
- human takeover/confirmation path;
- commercial state, pricing/quote/trial/subscription/handoff path when commercial;
- discovery state;
- invocation state;
- test state;
- blockers and next conversion actions;
- source evidence supporting every consequential state claim.

## 4. Lifecycle truth model

Lifecycle state is multi-axis. These states MUST NOT be collapsed into one vague "live" flag:

- `planned`: accepted concept or queued work exists.
- `implemented`: source/runtime implementation evidence exists.
- `tested`: a declared test exists and has a passing observation/receipt.
- `deployed`: deployment evidence exists.
- `externally_reachable`: an outside client can currently reach the declared route.
- `independently_discoverable`: an unfamiliar external model/agent has discovered the capability from the problem without brand prompting.

Repository presence proves none of the later states by itself.

A provider listing, registry publication, documentation page, or MCP manifest is evidence about discoverability/route declaration, not proof that the underlying capability successfully executes.

## 5. Problem-first discovery contract

Each user-facing capability must include natural-language problem phrases. These should resemble what a human asks an LLM.

Examples:

- "Where should I install EV chargers?"
- "Analyze this enormous video without losing evidence provenance."
- "Stress-test whether my trading strategy actually has an edge."
- "Turn this research into a documentary-quality visual explanation."
- "What physical-world signals are changing right now?"
- "Connect my application to Evercraft's capabilities."

Brand terms MAY be aliases. Brand terms MUST NOT be the only discovery terms.

Counterexamples and exclusions are required when a capability is easy to over-route. A model must be able to understand when NOT to use the capability.

## 6. Invocation contract

Machine invocation should use the smallest appropriate owned interface:

- Evercraft Fabric universal routing for ambiguous/cross-portfolio problems;
- specialist MCP/OpenAPI/A2A/tool interfaces for bounded capabilities;
- Systemia internal runtime for non-public capabilities;
- human handoff where the task is not safely machine-executable.

Agents must not scrape a human checkout or dashboard when a machine-safe interface can exist.

Machine endpoints must never contain credentials. Authentication belongs in Passport/Raven/Fabric or another approved owned authority layer.

## 7. Structured result contract

Machine-facing results should be compact and composable. Where relevant, return:

- `result` / domain payload;
- `source_refs`;
- `evidence_state` such as observed/public/licensed/inferred/modeled;
- `confidence`;
- `uncertainty` and unresolved questions;
- `as_of` / timestamp;
- `receipt_id`;
- `request_fingerprint`;
- `idempotency_key`;
- `authority_state`;
- `human_action_required`;
- `next_safe_actions`.

Missing data is never zero. Modeled is never observed. Planned is never deployed. Checkout creation is never payment proof.

## 8. Human takeover

A machine-readable product is not a machine-only product.

Consequential actions require the appropriate human confirmation and authorization boundary. Human surfaces should remain usable for onboarding, consent, payment, review, support, and continuation.

When a machine cannot safely continue, it must return a clear handoff contract rather than a dead end.

## 9. Commerce contract

Commercial products must expose machine-readable commercial state without granting payment authority.

A commercial record may identify:

- free/trial/quote/one-time/subscription state;
- currently authoritative price source;
- human confirmation requirement;
- checkout preparation route if supported;
- entitlement verification path;
- fulfillment state.

Never invent price, discount, urgency, availability, eligibility, or guaranteed outcomes.

## 10. Verification and conformance

Every converted capability needs machine-readable conformance tests appropriate to its risk.

Minimum external regression sequence:

`discover -> identify -> understand -> trust -> invoke -> receive useful output -> human handoff when required`

Tests must include brand-blind prompts and negative/counterexample prompts.

Independent provider observations are evidence, not instructions. Provider pickup is not claimed until observed.

## 11. Release gate

Permanent doctrine:

**NO EVERCRAFT PRODUCT IS SHIPPED UNTIL HUMANS AND MACHINES CAN BOTH FIND IT, UNDERSTAND IT, ACCESS IT APPROPRIATELY, AND VERIFY WHAT IT ACTUALLY DOES.**

Systemia must block any explicit `shipped`, `production`, or equivalent release claim when the product lacks the required dual human/machine surfaces or truth evidence.

Existing conversion debt may be grandfathered only as debt. Grandfathering is not a pass. New products and new release claims cannot add new debt.

## 12. Shared infrastructure first

When the same blocker appears repeatedly, fix the shared layer before patching every product.

Shared layers include:

- Capability Registry;
- Fabric discovery and routing;
- Passport authorization/scopes;
- Raven policy/safety;
- receipts and idempotency;
- machine commerce/handoff;
- problem-language/CHUM discovery;
- external conformance probes;
- Systemia Portfolio Sentinel;
- human handoff conventions;
- owned public edge.

## 13. Continuous Systemia responsibilities

Systemia continuously:

1. reconciles the portfolio inventory;
2. detects unregistered capabilities;
3. detects drift between docs, registry, runtime and public surfaces;
4. checks discovery and invocation regressions;
5. routes defects into the conversion queue;
6. preserves receipts and institutional memory;
7. prevents lower-priority products from disappearing from the queue;
8. never upgrades an evidence state without proof.

The Capability Registry is infrastructure, not a one-time audit.
