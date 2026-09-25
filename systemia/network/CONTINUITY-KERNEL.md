# Evercraft Continuity Kernel v1

The continuity kernel decides what survives when power, memory, compute, or thermal headroom collapses.

The rule is simple: **do not let every workload fail equally.** Shed luxury work first and preserve the nervous system.

## Priority order

0. life and safety continuity
1. identity, trust, routing, receipts, and admission
2. mission-critical Saban execution
3. Hearth durability, checkpoints, and delayed delivery
4. operator communications
5. ordinary workloads
6. analytics, publishing, crawling, and other bulk/background work

Each workload declares a resource cost and may declare a lower-cost degradation mode. For example, a Saban mission that cannot afford a large local model may degrade to deterministic tools plus queued inference instead of disappearing completely.

## Required behavior

- critical services are admitted before lower-priority work;
- nonessential work is shed before required continuity work;
- a lower-cost declared fallback may be admitted when the full workload no longer fits;
- the kernel reports **CRITICAL_RESOURCE_DEFICIT** when the remaining hardware cannot sustain required services;
- the system must not claim resilience beyond the energy and compute that physically remain.

## Why this matters

Blackout resilience is not only a networking problem. A node can be perfectly reachable and still be useless because its battery is dying, its RAM is exhausted, or a local model consumes the remaining compute budget.

Saban therefore needs both topology awareness and **resource triage**. As the network contracts, the swarm contracts with it.

## Current proof

continuity-kernel-proof.mjs verifies four descending resource envelopes. In the survival envelope, analytics, publishing, and ordinary automation are shed while Guardian continuity, identity/trust/routing, receipt lineage, a degraded Saban mission runtime, and Hearth checkpointing remain admitted.

It also verifies the opposite boundary: when even those requirements cannot physically fit, the kernel reports a critical deficit instead of manufacturing a green status.
