# Systemia Architecture Intelligence

Systemia Architecture Intelligence gives Evercraft a source-grounded map of software relationships without turning model intuition into architecture facts.

## Core rule

**Source, not vibe.**

A material claim about what code does should point to source, observed runtime evidence, or a durable execution receipt. Those are separate evidence lanes:

1. **Declared**: static source says a relationship exists.
2. **Observed**: runtime instrumentation saw the relationship execute.
3. **Receipted**: a durable downstream receipt proves a consequential result occurred.

Static source alone never proves production behavior.

## Scanner contract

`tools/systemia_architecture_scan.py` is intentionally read-only.

It:

- never imports or executes scanned application code;
- uses Python's standard-library AST for supported Python constructs;
- uses conservative literal-import extraction for JS/TS and labels that coverage partial;
- emits stable node and edge keys for unchanged source;
- stores exact source locations and excerpts on declared relationships;
- reports parser gaps and warnings rather than silently upgrading them to certainty;
- makes no runtime, deployment, billing, delivery, or production-health claim.

## Reconciliation contract

`tools/systemia_architecture_reconcile.py` merges evidence without collapsing the evidence lanes.

For each relationship it preserves whether the edge was:

- declared in source;
- observed at runtime;
- confirmed by a durable receipt.

Its agreement states are:

- `declared_only`
- `observed_only`
- `declared_and_observed`
- `receipt_confirmed`

The reconciler can surface high-value mismatches such as:

- runtime behavior that is not represented in declared topology;
- declared critical paths that are not observed in supplied runtime evidence;
- publishing/routing/write paths that lack durable downstream receipts.

The current reconciler is deliberately bounded. It does not claim that a missing runtime observation means code is dead unless that relation is explicitly in the watched set and relevant runtime evidence was actually supplied.

## Health layer

Later health rules can build on reconciled edges to detect orphaned outputs, dead branches, stale dependencies, cycles, duplicate capability paths, single points of failure, and attempted work with no downstream proof. Findings should carry exact subject edges/nodes and evidence references before they can spawn repair work.

## Privacy boundary

Public discovery and public repositories must not expose private Systemia/admin topology, customer data, credentials, or internal authority. The scanner may be used on public code in CI, while private topology snapshots remain on governed internal surfaces.

## Local use

```bash
python tools/systemia_architecture_scan.py --root . --out /tmp/systemia-architecture.json
python -m unittest discover -s tests -p 'test_systemia_architecture_*.py' -v
```

The output is architecture evidence, not execution authority.
