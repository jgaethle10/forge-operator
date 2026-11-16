# Flight Sentinel Infrastructure Guardian v0.2 | Assurance and stop-ship register

**Research-only**: not operational aviation, ATC, cybersecurity, or network-control software. All examples are invented. Passing unit tests does not establish physical safety.

| Research claim / question | Evidence | Present status |
|---|---|---|
| Detect broken or cyclic declared dependencies | `test_unknown_dependency_rejected`, `test_dependency_cycle_rejected` | Tested in toy graph |
| Preserve declared critical services when evaluating proposed isolation | `test_visible_single_route_harm_blocked`, `test_visible_backup_outage_harm_blocked` | Tested only with reported data |
| Refuse to assume telemetry is fresh or approved | `test_stale_evidence_holds`, `test_not_automatically_authorized` | Tested with synthetic Boolean flags |
| Flag explicitly declared shared roots across routes | `test_common_declared_dependency` | Partial; only known/declared dependencies |
| Correctly infer hidden common-mode power dependencies | `test_unknown_hidden_dependency_cannot_be_inferred` | **FAILED / OPEN** |
| Detect coherently incorrect reported health | `test_faults_are_preserved_as_counterexamples` | **FAILED / OPEN** |
| Prevent interventions that disrupt a supposedly redundant service | `test_hypothetical_harm_flagged` | **FAILED / OPEN**, harm demonstrated |
| Correctly evaluate real service availability, genuine sensor identity, and dependency evidence | None | Not implemented |
| Establish fault-recovery safety, human approval, operator interface and regulatory compliance | None | Not implemented |
| Never access live infrastructure from the experiment | Code review of pure local models | Design boundary, not certified isolation |

## Deliberate unresolved failures

Two fictional scenarios return a **PROPOSE_SANDBOX_ONLY** advisory although the ground-truth toy model shows that isolating a relay would take the **voice** and **tracking** services down. The proposed intervention is never executed outside an in-memory state evaluator.

1. Hidden dependence: an alternate route relies on failed shared power that the declared topology omits.
2. Misleading telemetry: a backup route is physically down in the fictional truth, but the reports consistently claim it is healthy.

The reported two failures are not representative frequencies. They define missing safeguards and should not be removed merely to increase a reported success rate.

## Stop-ship

No external traffic collection, actual ATC/FAA topology modeling, autonomous isolation, aviation control, authenticated operator approval, validated fallback, real source verification, pilot/operator procedures, or safety guarantees. Independent qualified engineering and safety review, real hazard analysis, and applicable assurance/certification work would be mandatory **before** a future proposed integration. Keep v0.2 OFFLINE.
