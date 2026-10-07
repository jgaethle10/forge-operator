# Lineage Design-Partner Radar

Date: 2026-10-07

This is a small evidence-backed target board for the first five paid Lineage pilots. It is not a bulk-mail list.

## Buyer qualification rule

Prioritize teams that publicly demonstrate all or most of:
- multiple coding agents or heavy agent use;
- shared repository coordination;
- explicit collision, history, visibility, review, or orchestration pain;
- small enough organization that a $500 pilot can move quickly;
- real engineering workflow where Git remains important;
- buyer/operator who can authorize one repository.

Do not scrape private contact data or mass-message employees. Start from public company channels, founder/engineering channels, or warm introductions where available.

## Tier A: direct design-partner candidates

### String
Public evidence:
- careers page says the engineering team uses coding agents heavily;
- explicitly says it builds workflows and tools to make several agents useful at once without letting them collide, repeat work, or quietly make the wrong call;
- hiring engineers to improve those agent workflows and coordination tools.

Why Lineage fits:
Their public problem statement is almost a direct description of Lineage's stale-writer, provenance, rationale, and reconciliation layer.

First angle:
"You already built coordination around several coding agents. Lineage handles the history layer underneath that: stale-writer protection, preserved competing commits, actor/rationale provenance, integrity receipts, and Git mirroring. Would you test it on one internal tooling repo for a bounded $500 pilot?"

Source:
https://usestring.ai/careers/engineering-intern

Priority: A1
Motion: paid pilot buyer; possible deeper integration partner later.

### Dailybot
Public evidence:
- says its engineering team runs Claude Code agents overnight;
- describes waking up to dozens of changed files across multiple repos;
- explicitly says the team did not know what happened because agent work was invisible.

Why Lineage fits:
Dailybot solved agent-to-team communication. Lineage can complement that at the canonical history layer, preserving actor, rationale, competing state, semantic changes, and reconciliation.

First angle:
"You gave coding agents a voice in team coordination. We built the history layer underneath that problem. A Lineage commit can preserve which agent changed what, why, its authority, semantic diff, and whether its branch write was stale. Interested in trying it behind one repo while GitHub stays mirrored?"

Source:
https://www.dailybot.com/blog/dailybot-plugin-for-claude-and-skill-for-cursor/

Priority: A2
Motion: pilot buyer plus integration conversation.

### Vellum
Public evidence:
- says a 15-engineer team increased from 946 PRs to more than 1,900 PRs in the compared period after investing in coding-agent infrastructure;
- says 37% of PRs were initiated by background agents;
- describes parallelizing work and investing in agent infrastructure.

Why Lineage fits:
High agent-generated PR volume creates exactly the audit/history/reconciliation pressure Lineage is designed to absorb.

First angle:
"You have enough background-agent throughput that Git history is now carrying organizational state it was never designed to express. We built Lineage for the layer below the PR: competing-agent CAS, provenance/rationale, immutable receipts, integrity verification, and Git projection. One repo, $500 founding pilot."

Source:
https://www.vellum.ai/blog/how-we-use-coding-agents-to-2x-engineering-output

Priority: A3
Motion: paid pilot buyer.

### Kapwing
Public evidence:
- company says it reached 100% employee adoption of AI coding agents in Q1 2026;
- approximately 25-person company with about a dozen engineers;
- non-engineering staff also began committing production code.

Why Lineage fits:
As the actor population expands beyond engineers, actor identity, rationale, authority boundaries and auditable change history become more important, not less.

First angle:
"You got agent-assisted code contribution outside the engineering team. We are building the governed history layer for exactly that transition: who/what changed something, why, what authority they had, stale-writer protection and explicit reconciliation while GitHub stays connected."

Source:
https://www.kapwing.com/blog/how-we-achieved-100-adoption-of-ai-coding-agents/

Priority: A4
Motion: pilot buyer.

### MetalBear / mirrord
Public evidence:
- openly documents daily AI use by its engineering team;
- team reported as 34 people with 15 engineers;
- technically sophisticated infrastructure product with complex local/Kubernetes state.

Why Lineage fits:
Technical buyer likely to understand canonical history, local/remote state, provenance and Git interoperability quickly. Complex infrastructure makes reproducibility and agent attribution valuable.

First angle:
"Your team already treats AI as part of real engineering, not demo code. We are testing a history substrate that sits beneath Git workflows and preserves agent identity, rationale, integrity and collision state. One repo, GitHub stays mirrored, $500 pilot."

Source:
https://metalbear.com/blog/engineering-ai-use/

Priority: A5
Motion: pilot buyer.

## Tier B: ecosystem / integration conversations

These are not the first companies to pitch as generic buyers because they already build agent orchestration products. Their value may be embedding or partnering with Lineage as the canonical history/reconciliation layer.

### Capy
Evidence:
- markets parallel coding-agent fleets to startup teams;
- explicitly describes 25 agents as a workforce.

Potential relationship:
Capy runs agents; Lineage can retain governed cross-agent history beneath the fleet.

Source:
https://capy.ai/yc

### AgenZync
Evidence:
- explicitly positions "parallel coding agents" with "one governed delivery path";
- uses worktrees, intents, changesets and reconciliation.

Potential relationship:
Strong conceptual adjacency. Could be competitor, integration partner, or design collaborator. Do not lead with generic customer pitch.

Source:
https://agenzync.com/developers

### Lattis
Evidence:
- markets a workspace for parallel coding agents;
- emphasizes visibility/control and multiple simultaneous agents.

Potential relationship:
Lineage could provide deeper canonical history/provenance under an agent IDE layer.

Source:
https://getlattis.ai/

### Sophylabs / DevboardAI
Evidence:
- built and sells a local-first multi-agent coding orchestrator;
- parallel agents run in isolated Git worktrees.

Potential relationship:
Potential Lineage integration beneath the orchestrator, especially for history/reconciliation beyond worktree lifecycle.

Source:
https://www.sophylabs.com/case-studies/devboardai

## Do not lead with these

### Anthropic / OpenAI / Cursor / very large platform vendors
They validate the category but are poor first-$500-pilot targets. Procurement and internal infrastructure make them slow. Use their public workflows as market evidence, not as the immediate revenue plan.

### Random businesses that do not already use agents
Do not spend the first call educating them on why parallel coding agents matter. The founding pilot is for teams already feeling the pain.

## First-five revenue target

If all five founding pilot slots sell:
- 5 × $500 = $2,500 one-time pilot revenue.
- A single conversion to the $1,500+ workflow sprint lifts the initial cohort to at least $4,000.
- The objective is not maximum contract value yet. It is paid validation, a real external repo receipt, one credible case study, and proof that Lineage solves a pain outside Evercraft.

## Outreach sequence

1. Start with String, Dailybot, Vellum, Kapwing, MetalBear.
2. One tailored message per company tied to its published workflow.
3. Link only the Lineage page and two-agent proof after the public canary is verified.
4. Ask for a 15-minute technical fit conversation or direct $500 pilot, depending on buyer signal.
5. No follow-up spray. One useful follow-up with an additional proof or integration observation.
6. Record outreach owner, date, response, objection, and next action in the central Evercraft revenue ledger before contacting another person at the same company.

## Success definition

The first commercial win is not "someone liked the post."

It is:
- one external buyer authorizes one repository;
- $500 payment is provider-verified;
- Lineage imports that repository;
- the buyer sees a real Control Room;
- Git remains mirrored;
- a real agent-history or coordination gap is observed;
- the pilot produces a receipt-backed closeout;
- the buyer either expands, declines with a specific reason, or becomes a case-study/reference candidate.
