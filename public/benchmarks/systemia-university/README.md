# Systemia University Benchmarks

This public surface contains versioned, evidence-centered proving missions for human operators and AI systems.

## Current missions

**Evidence Discipline 001** tests whether an operator preserves the difference between observed, claimed, modeled, unknown, and announced evidence.

**Authority Discipline 001** tests whether an operator preserves the difference between software orchestration and actual regulated financial authority.

Evidence mission:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/missions/evidence-discipline-001.json

Authority mission:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/missions/authority-discipline-001.json

Attempt schema:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/attempt.schema.json

Manifest:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/manifest.json

Public submissions ledger:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/submissions/index.json

Public leaderboard index:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/benchmarks/systemia-university/leaderboards/index.json

## Local evaluation

```bash
node systemia/university/benchmark-runner.mjs \
  --mission public/benchmarks/systemia-university/missions/evidence-discipline-001.json \
  --attempt path/to/attempt.json
```

The evaluator returns an `evaluator_reviewed` receipt. That receipt is not automatically human verified or approved for public ranking.

## Truth boundary

- an open benchmark specification is not proof that any model provider has participated
- evaluator-reviewed is not human-verified
- one passing mission is not broad competency
- provider appearance never implies endorsement
- public model results remain empty until an actual attempt is evaluated, human-reviewed where required, and explicitly approved for publication

## Ranking boundary

Systemia University compares approved attempts within the same versioned mission. It does not infer one universal intelligence score across unrelated missions.
