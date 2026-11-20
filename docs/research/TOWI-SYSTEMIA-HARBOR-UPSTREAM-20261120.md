# Systemia -> Harbor | Upstream evidence and institutional investigation contract

**Status: proposed source integration, not a deployed resident transfer.**
**Direction:** Evercraft specialists -> Systemia evidence authority -> Harbor editorial desk -> authorized Journal / Clip release.
**Founder's scope (November 20, 2026):** TOWI and every other department feed Harbor. Harbor does not become a second research director or Systemia mission authority.

## Roles and boundaries

- **Rockies** reads permitted public sources, learns quiet baselines and emits provenance-bearing observations. The declared 99 baseline logical allocations, 26 ranges and 384 surge ceiling in `systemia/rockies/roster.json` are **design targets**, not evidence of deployed observers. The independent November 20 Harbor review was limited to issue/PR records and did not inspect repository file contents, so lack of roster text in its result is not an absence finding.
- **Context Fabric / Worldstate** retain and contextualize authorized source observations, material changes and contradictions. Sentinel handles correlation; Signal Fabric decides alerts, independently from editorial publication.
- **TOWI** opens or accepts an evidence-led question; retrieves and preserves original authorized records; asks competing questions; evaluates refutation criteria; tracks methods, source gaps, uncertainty and response from responsible institutions. Its existing research workflow/register is reported by Harbor in a private distribution workspace, **not** independently verified in this repository. Do not claim daily live TOWI runs, outbound institutional outreach, or complete report publication without owner-runtime receipts.
- **Other departments** (FAIE, AAAR, Medical Discovery, Saban, Worlds, Fallen, Spatial Perception, Subsea Watch, etc.) own their facts, methods, source artifacts, execution limits, rights, and review gates. They may submit signed or otherwise authoritatively verified, **public-safe projections** to Systemia.
- **Systemia** owns job admission, permissioning, source identity, evidence lineage, authoritative receipts, private/public projection and prioritization. Systemia may route a separately admitted research request back to a specialist; merely asking Harbor for a story never authorizes new collection or external contact.
- **Harbor** is the consumer/editor of verified **candidates**, responsible for clarity, editorial challenge, visual collaboration and lawful platform adaptation. Harbor may ask Systemia questions and recommend follow-up missions, but may not issue specialist commands through an editorial packet, mark a research finding verified, release private material, independently authorize source changes, contact an external institution or publish simply because an upstream packet exists.
- **Journal/Clip** apply the existing 10/10 editorial gate, rights, scope, provider authority, independent public readback and corrections record. Story-ready is not published.

## Technical source contract

`systemia/newsroom/systemia-harbor-upstream.mjs` provides a **pure, non-executing** `prepareSystemiaHarborCandidate(record, trustedChecks)`. It defaults to HOLD; requires valid departmental identity, exact source IDs, source-bound public claims, evidence types, uncertainty, read-only public source URLs, a trustworthy producer registry check, authoritative receipt check and trusted public-projection verification; then emits `evercraft.systemia.harbor.upstream-candidate.v1`.

The returned candidate always has false publication, outreach, research dispatch and delivery permissions. Do not treat an upstream `review_state` as external expert review or Journal acceptance. **The trusted checks must be supplied from actual Systemia authority and must bind the exact candidate payload/digest to the recorded source revision, not just a matching identifier.** A mocked callback is a unit-test fixture, never field verification.

## TOWI two-clock operation

1. **Research clock:** Run bounded authorized research and check for existing duplicate cases, stalled jobs, source freshness, contradictory material, missing original records, disproof attempts, and next useful measurements. Retain versioned case files in the actual authorized private storage. No assumption that private Harbor workspace is an Evercraft Interaction Ledger.
2. **Publication clock:** As genuinely meaningful sections become ready, produce distinct public-safe evidence briefs, corrections, or full investigative dossiers for independent review. Do not invent a daily report to satisfy a calendar. Before sensitive allegations, contact the affected party through separately authorized, verified channels where appropriate; urgent public-safety findings follow responsible safety escalation.
3. **Institutional contact:** Keep a separate six-state contact ledger: draft, reviewed, authorized, sent-with-provider-proof, responded-with-evidence, closed. Never infer that a draft, approved letter or GitHub issue was externally delivered. Any send must pass source scope, recipient verification, privacy, authorized sender/Passport and review; routine internal investigation does not confer public-institution contact authority.

## Department-to-Harbor implementation acceptance

- Inventory actual TOWI cases and sources, then reconcile with Systemia mission IDs and any private research workspace; preserve the five inventory-pending cases until reviewed.
- Bind approved TOWI and other department source revisions to **independent receipt and public projection checks**, with replay-safe exact version identity and content digest. No direct Harbor -> department or department -> external publication route.
- Route an authorized bounded candidate from each of TOWI and one non-TOWI department through the **existing** Systemia intake without an external send, and obtain receipt-backed Harbor pickup ACK. Mock tests do not count.
- Prove an editorial HOLD for stale, sensitive, unsourced, contradicted or independently unreviewed consequential claims; preserve non-public original evidence within Systemia custody.
- Validate how Harbor's workspace receives the approved candidate over an authenticated owned channel, retaining dedup/ACK and source revision lineage. Do not assume GitHub is the media or private case-file transport.
- Only after genuine runtime checks and independently approved release may Harbor create the Journal publication and Clip derivatives. Separately verify external publication receipts.
- Keep this direction visible in the canonical Systemia / Journal / Harbor publishing documentation without silently replacing existing policies.

## Current proof statement

**Source code and tests can prove the proposed handoff contract and its fail-closed behavior.** They cannot by themselves demonstrate that the Harbor agent, the TOWI daily loop, institutional outreach, Systemia live execution, Journal or Clip publication has been connected. Each requires its own private/runtime/source-and-destination proof.
