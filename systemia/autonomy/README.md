# Systemia Autonomy Liveness

This directory owns the fail-closed continuity contract for autonomous Evercraft missions.

## Doctrine

An autonomous mission is a lease, not a note in a backlog.

A revenue-bearing lane is not healthy merely because a workflow, scanner, queue or product exists. It must keep producing fresh execution evidence until it reaches a truthful terminal state.

Required mission flow:

DISCOVERED -> ADMITTED -> EXECUTING -> VERIFYING -> NEXT_ACTION -> TERMINAL

Allowed terminal states: verified_money_received, verified_outcome_complete, opportunity_lost_with_reason, explicitly_killed, or blocked_needs_human.

active, queued, sent, drafted, checkout_created, assigned and attempted are never terminal success states.

## Revenue Autonomy Heartbeat

.github/workflows/revenue-autonomy-heartbeat.yml runs every five minutes. It proves the supervisor contract, inspects revenue-critical workflows, turns missing/stale execution into incidents, issues bounded recovery dispatches where authorized, checks that sell_now offers have structured continuation, refreshes Saban revenue formation, and uploads receipts.

Recovery dispatch is not recovery proof. A later cycle must observe fresh execution evidence.

## Internal and external halves

GitHub/Systemia supervises internal execution directly. Authenticated external intake covers Bridge Builders re-entry, hackathons and competitions, AI/agent/automation jobs, implementation partnerships, and Business Rescue opportunities.

The external monitor may research, deduplicate, qualify, prepare evidence and draft packages. It must not silently accept third-party legal terms, stake money, create payment obligations, bypass CAPTCHA/MFA, change account security, or invent submission/payment receipts.

## Competition chain

Systemia scout -> build/test -> Raven QA -> authorized platform execution -> external receipt -> memory

When a platform requires human acceptance of competition terms or another legally consequential action, the lane becomes blocked_needs_human with the exact gate surfaced. The rest of the work continues autonomously.

## Revenue truth

qualified signal -> conversation -> proof/demo -> explicit offer -> payment requested -> provider-verified payment

Discovery volume, outbound volume, likes, drafts, checkout creation and assignments are not revenue.

## Current receipts

- artifacts/autonomy-revenue/workflows.json
- artifacts/autonomy-revenue/liveness.json
- artifacts/autonomy-revenue/heartbeat.json
- artifacts/saban-revenue/latest.json
- artifacts/saban-revenue/latest.md
