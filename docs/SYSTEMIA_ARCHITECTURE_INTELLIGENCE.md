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

## Reconciliation layer

The scanner is only the declared-topology lane. Internal Systemia deployments should reconcile scan results against runtime observations and durable receipts.

Useful agreement states are:

- `declared_only`
- `observed_only`
- `declared_and_observed`
- `receipt_confirmed`

This makes several important failure classes visible: orphaned outputs, dead branches, undeclared runtime coupling, stale dependencies, dependency cycles, duplicate capability paths, single points of failure, and attempted work with no downstream proof.

## Privacy boundary

Public discovery and public repositories must not expose private Systemia/admin topology, customer data, credentials, or internal authority. The scanner may be used on public code in CI, while private topology snapshots remain on governed internal surfaces.

## Local use

```bash
python tools/systemia_architecture_scan.py --root . --out /tmp/systemia-architecture.json
python -m unittest tests/test_systemia_architecture_scan.py -v
```

The output is evidence for architecture analysis, not execution authority.
