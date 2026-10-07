# Lineage Founding Pilot Outbound Playbook

Date: 2026-10-07

## Objective

Close the first paid Lineage design partner without mass outreach.

The ideal first buyer is already feeling multi-agent coordination pain. Do not educate a cold prospect into believing they need AI agents first.

## High-fit buyer signals

### 1. AI-native development agencies
Signal:
- team publicly uses Claude Code, Cursor, Codex, Devin, OpenHands or multiple coding agents;
- several developers/agents touch the same repositories;
- agency needs reviewable client history and clean handoff.

Opening question:
"How are you preventing two agents from advancing the same repo state without one silently invalidating the other's work?"

### 2. Small software teams scaling agent use
Signal:
- 3-30 engineers;
- experimenting with parallel coding agents;
- GitHub remains central;
- review/merge load is increasing.

Opening question:
"When two agents start from the same head, what tells you the second one is stale before it writes history?"

### 3. Agent-platform / orchestration teams
Signal:
- product dispatches multiple workers;
- needs durable audit or human review;
- branch/worktree logic is becoming application infrastructure.

Opening question:
"Do your agents have a canonical transaction/history layer, or is Git commit state carrying identity, rationale and authority by convention?"

### 4. Game / media / spatial software teams
Signal:
- code plus large binary or world assets;
- Git/LFS workflow friction;
- AI agents increasingly alter metadata, scenes, scripts or build assets.

Opening question:
"Can your current history model explain one governed change across code plus a large world/media asset without treating the asset as an opaque sidecar?"

### 5. Regulated or audit-sensitive AI engineering
Signal:
- approval, audit, provenance, reproducibility or rollback matter;
- AI writes code or workflow artifacts;
- team needs to distinguish visibility from authority.

Opening question:
"Can you show who or what changed this, why, what evidence justified it, and whether that actor actually had authority to ship it?"

## Qualification

A prospect is pilot-qualified when at least three are true:
- already uses one or more coding agents weekly;
- has had agent/branch/worktree collision or review confusion;
- uses GitHub/GitLab as current source host;
- wants human review before canonical merge/release;
- needs provenance or audit beyond commit message;
- has non-code artifacts that matter to history;
- buyer can authorize access to one repository;
- $500 can be approved without procurement theater.

## Offer

Lineage Founding Pilot:
- $500 one-time;
- first 5 external design partners;
- one authorized repository;
- 14-day governed evaluation window;
- private Control Room;
- stale-writer proof;
- provenance/rationale setup;
- semantic diff + integrity baseline;
- Git mirror/export proof;
- closeout architecture packet.

Do not discount the first offer below $500 without a concrete strategic exchange such as public case-study rights, a high-value integration partner, or a distribution commitment.

## Proof-before-pitch demo

Lead with the synthetic two-agent race in `/lineage/demo.json`.

The key moment is not "look at our dashboard."

The key moment is:

Agent A advances the branch.
Agent B tries to advance from the same old head.
Lineage refuses the stale ref update.
Agent B's proposed immutable commit remains inspectable.
A human reconciles deliberately.

Then show the Control Room.

## Call to action

"Give us one AI-heavy repo. We will put it behind Lineage for a bounded $500 pilot while GitHub stays connected as the mirror. If it does not expose missing history or reduce coordination risk, do not expand it."

## Distribution rules

- no mass Gmail spray;
- no pretending Lineage is already a public multi-tenant SaaS;
- no fake customer logos;
- no fake production metrics;
- no claiming a public URL is live until external canary;
- no automatic repository intake;
- no payment claim without Evercraft Payments verification;
- no cold access requests for private source.

## Market note

The category is already forming around coding-agent version control, parallel agent branches, worktrees, AI code review and agent session management. Lineage should position one layer deeper: governed canonical history across actors and artifact types, with Git interoperability rather than Git-only semantics.
