# Flight Sentinel Infrastructure Guardian | v0.1 Assurance Register

This is a research ledger, **not** an aviation safety case or operational incident analysis. Every result uses deliberately fictional network events.

| ID | Safety/resilience question | Test reference | Research status |
|---|---|---|---|
| FS-IG-01 | Are transient bursts distinguished from sustained overload? | test_persistence_avoids_single_spike; test_two_samples_propose | Simulated only |
| FS-IG-02 | Can malformed / stale / reordered telemetry cause conservative advisory? | test_invalid_numeric; test_missing_tick; test_stale_observation | Simulated only |
| FS-IG-03 | Can two reported perspectives reveal obvious disagreement? | test_sensor_disagreement; test_split_evidence_holds_instead_of_isolating | Simulated only |
| FS-IG-04 | Is real, authentic source independence established? | test_coherent_spoof_is_blind_spot | **UNRESOLVED: coherent false telemetry escapes detection** |
| FS-IG-05 | Can correlated backup failure be detected? | test_common_backup_fail_cannot_be_assumed_safe | Partial; fictional Boolean flag, no verified topology |
| FS-IG-06 | Can a distributed multi-source overload be contained? | test_distributed_burst_not_localized | **UNRESOLVED: not isolated** |
| FS-IG-07 | Does hypothetical action require explicit test approval? | test_no_permission_no_isolation | Simulated only; no real authorization semantics |
| FS-IG-08 | Are real-world false alarm costs characterized? | one_tick_spike; maintenance_burst | **UNRESOLVED: no operational population data** |
| FS-IG-09 | Is production infrastructure or ATC control isolated from the research? | Source review and no external I/O in model | Design restriction; no certified isolation proof |
| FS-IG-10 | Can any live deployment safely contain an outage? | None | **STOP: no evidence, no deployment permitted** |

## Do not ship / do not claim

No live monitoring, source authentication, production isolation, real emergency ground-stop logic, aviation operational certification, full FAA incident reconstruction, malware/AI attack attribution, or demonstrated reduction in real-world incident risk. An anomaly can reflect maintenance, overload, measurement error, unintended configuration, or malicious actions; attribution is a separate evidence burden.

Next gate: independent qualified engineering review of proposed observations, correlated fault domains, false alerts, human decision paths, safe recovery, and resulting hazard register. Keep all test scenarios offline.
