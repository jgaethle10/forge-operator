# Flight Sentinel | Research assurance traceability, v0.6

**This is an open research inventory, NOT a passed aviation safety case.** No real-world operations or certification are allowed from this work. Evidence references below are either GitHub reference tests or **locally packaged** lab tests; only CI completion can establish GitHub verification.

| Research ID | Intended property | Current reference evidence | Status | Critical limitation |
|---|---|---|---|---|
| FS-R01 | An invalid sensor/proposal should yield symbolic rejection | v0_4/test_v04.py:test_nan_inf_bool_rejected and test_missing_reading_denied | SIMULATED | No live sensor/transport authentication |
| FS-R02 | Out-of-order or repeated state should be rejected | v0_4/test_v04.py:test_replay | SIMULATED | Clock trust and actual authority remain open |
| FS-R03 | Source disagreement should not be concealed | v0_5/test_v05.py:test_pair_spoof_detected | SIMULATED | Claimed independent sensor identities are not proof |
| FS-R04 | Detect all coherent multi-source spoofing | v0_5/test_v05.py:test_triple_spoof_is_still_missed; v0_6/test_recovery_reference.py:test_consistent_spoofing_still_missed | **FAILED / OPEN** | All fictional sources can agree while wrong |
| FS-R05 | Disturbance uncertainty should be modeled | v0_5/test_v05.py:test_wind_within_bound, test_wind_exceeds_assumption | PARTIAL | Wind bound is invented, unverified |
| FS-R06 | Alerts should lead to recoverability, not only detection | v0_6/test_recovery_reference.py:test_match_21_cases and test_four_second_delay | **FAILED / OPEN** | Six toy breaches remain at 1-second delay; no actual fallback |
| FS-R07 | Detect interventions that make a trajectory worse | v0_6/test_recovery_reference.py:test_wrong_pose_can_hurt | **COUNTEREXAMPLE DOCUMENTED** | One handoff introduces a new toy boundary crossing |
| FS-R08 | No fallback without an explicit approved symbolic acknowledgment | v0_6/test_recovery_reference.py:test_no_ack_never_switches | SIMULATED | Supplied booleans are not real pilot/operator authorization |
| FS-R09 | Measure dependency on handoff timing | v0_6/test_recovery_reference.py:test_eight_second_delay | SIMULATED | Delays are invented; no worst-case task scheduling |
| FS-R10 | Never expose actual aircraft controls | Source tree review, read-only CI, no I/O code in versioned laboratory subset | DESIGN RESTRICTION | Not a proven runtime isolation guarantee |

## Explicit stop-ship items

- Certified aircraft model, flight-envelope evidence, control authority and genuine independent sensor attestation: **not started / not demonstrated**.
- Counterexamples from coherent spoofing, unmodeled wind and dangerous fallback interventions: **unresolved**.
- Independent qualified systems-safety/cybersecurity review and applicable certification planning: **unavailable**.
- Human factors, false-alert burden, degraded control, and recovery failures: **not validated**.
- Real aircraft, UAV, radio, hardware, autopilot, actuator or flight bus integration: **prohibited for this research stage**.

## Local versus GitHub evidence

The independently downloadable v0.6 offline kit passed **125 local Python tests** and includes an HTML viewer of 21 synthetic scenarios across five delay settings. The PR includes a reviewable v0.6 reference subset with **17 tests**, not the entire 125-test local kit. GitHub workflow results must be read separately and never generalized as evidence of airworthiness.

**Release posture:** draft research / review only. No commercial claims of flight-safety protection or attack prevention.
