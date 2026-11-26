# Systemia / Evercraft Network / Saban Resilience Revival

Date: 2026-11-17; workstream: `evercraft-network-saban-resilience-revival-20261117`. This is an owned-GitHub source recovery and draft engineering change, NOT a production network deployment. This document preserves provenance and routes the proposed work through Systemia's canonical Network area; it is **not proof of a live Systemia DB mutation**.

## Recovered chronology and authority boundaries

* 2026-09-02: historic Network flagship and Emergency Command operations split. Founder's historical app ID: `6a983e0ad004be753d51d569`; keep as archival locator only, never contact Base44.
* 2026-09-04: RADIO ROSTO / RS-15 NORAD 23439 SGP4 Yakima pass modeling reported in historical original-app records; about 15 forecast passes in 48 hours. Historical source SHA `76bf2a1362e5ffe6dfb3f347c6ffe717d2ed60f9` is NOT in the accessible GitHub mirror, so original source and 15-pass computation are not independently re-executed. No verified receiver or RF connection.
* 2026-09-08 through 09-18: authentic Verizon Consumer Wholesale email exchange and 2026-09-17 meeting. Verizon's September 18 reply specifies $1.5M Consumer Wholesale first-year minimum, 3+ years, no Consumer Wholesale pilot, and possible MVNE/solutions-architect conversations. Not a partnership. Founder recalls Saban emerged from the differentiator challenge, but precise spoken meeting wording and moment of invention are not independently proven.
* 2026-09-24: verified GitHub commit `36d73f0f6ffd009d6e3570449b0c732e9dd9bdb7` introduced Universal Capacity Resolver proof. `proof-10000-summary.json` records 10,000 logical Saban agents in two local Node processes; 5,000 rebindings; chain `ab99a2ce7f708c0eddc724d3605134ae67aa66c91d3f9abb29150bb4c6d1ea69`. This is NOT a physical-device fleet or live heterogeneous capacity.
* Subsequent verified commits `531c91c1de7c99f1060b22387128121d86a2af1f` add offline continuity; `0d67e59913ce271bd88115cbd32fc6c09ef8347b` adds synthetic signed offline community-radio portal. Work Saban subsequently extends agent coordination, not a replacement for Network's continuity mission.

## Canonical code inventory and evidence classifications

| Source / capability | Evidence class | Validation boundary |
|---|---|---|
| `systemia/network/saban-network-proof.mjs`, `systemia/saban/compute-exchange.mjs`, `CAPACITY-RESOLVER.md` | Implemented software simulation | no external-provider measured allocation |
| `systemia/network/offline-continuity-proof.mjs` and Guardian/Nexus/Hearth/team roles | Implemented local control-plane proof | no independently validated physically distributed fleet |
| `systemia/network/secure-envelope.mjs`, `durable-state.mjs`, `reconciliation.mjs` | Implemented crypto/replay/checkpoint code | no production key enrollment or physical power-loss certification |
| `systemia/network/transport-router.mjs`, `file-courier.mjs`, `systemia/compute/capacity-beacon.mjs` | LAN, file courier, multicast software implementations | physical multiple-device discovery and USB handoff still lack proof |
| `systemia/network/community-radio-*` | Implemented synthetic lab only | no licensed RF/station partner or emergency integration |
| Penguin Node001 / NextGen Node002 | Historically operated physical hosts with reported distributed SHA-256 jobs | NOT live-reinspected in this recovery |
| ROSTO SGP4, original NetworkFabric/Radio Fabric, app-era checkpoints | Historical leads | source and original runtime receipts not revalidated in this repository |
| Wi-Fi Direct, BLE, satellite gateway, carrier eSIM integration | Proposed/blocked | permission, adapter, gateway and field evidence required |
| NEW `field-outage-lab.mjs` + test | Tested locally, two processes on ONE machine | two physical devices and an actual backhaul not yet tested |

## New bounded test

Run `node --test tests/network-field-outage-lab.test.mjs`. Local result: **1/1 PASS**; two Node processes; AES-256-GCM message successfully delivered; second message durably queued while peer process stopped; `NO_ROUTE`; delivered after restart with zero outbox; forbidden sender 403; simulated unconsented resource declined. This is process-level evidence, not physical outage coverage. SHA256 of local TAP transcript: `b485302a31a01df2c6b4c1d2cffbe8130a08adb4fabb5ab93c4aa561f9e3f712`. Runbook: `FIELD-OUTAGE-LAB.md`. Satellite architecture: `SATELLITE-BACKFILL-DTN-DESIGN.md`.

## Highest value unfinished work

1. Witness real isolated A/B LAN test with dated hardware receipts on consenting devices.
2. Add per-device pinned Ed25519/X25519 enrollment, revocation, clock/rollback gates and production secret lifecycle (today's test has one shared pairwise PSK).
3. Connect verified Network field artifacts to Systemia mission ledger and operational Emergency Command truth without overwriting prior original-app records.
4. Rehydrate original authorized app-era orbital/Radio Fabric/NetworkFabric source into GitHub under evidence-controlled provenance. **Do not contact retired Base44 runtime.**
5. Implement bounded authorized gateway emulator with fragmentation, duplicate filtering, durable custody-vs-delivery ACKs, then measure a real permitted carrier/satellite gateway.

## Verizon architectural pilot proposal

Evercraft Network: Intelligent Continuity Beyond Conventional Coverage. Propose a technical architecture review for a **2–5 consenting device single-site** demonstration, independent of Consumer Wholesale pilot eligibility. Evercraft supplies local trust, encrypted queueing, evidence/receipt engine, authorized resource selection, offline services and test plan. Authorized carrier/service partner supplies lawful cellular connectivity, optional managed data router, SIM/eSIM administration and applicable SLAs. Site operator owns power, topology, device consent and safety. Define no-WAN local delivery, disconnected queue growth, resumed delivery, gateway cutover, latency/throughput/battery/delivery measurements, consent revocation and actual physical field receipts. Commercial hypotheses: paid readiness assessment, per-site continuity software, managed retesting, and separate connectivity-integrator agreement. **No partnership or new Verizon contact is claimed.**

No Base44 runtime; no unauthorized discovery/access; no emergency-network interference; no production release or auto-merge in this draft.
## Additional Verizon voicemail evidence (founder-provided screenshot, date unconfirmed)

Founder supplied an iPhone voicemail screenshot on 2026-11-17, showing a 35-second message from an Atlanta-area telephone number. The iOS transcript identifies the caller approximately as **“Johnny Robbie”** (machine transcription; spelling not verified). The speaker states he is a Verizon sales engineer, part of a partnership team, following up on Evercraft's request regarding an “MBNO” or partnership (likely an automatic-transcription rendering of MVNO). He asks to learn more about Evercraft's requirements to determine team fit. **The message's actual receipt date is not visible**: the phone status-bar time and screenshot's displayed 11:01 AM are not a verified calendar date. The original audio was not supplied or independently verified; Verizon employment/identity has not been authenticated from this screenshot. A search of the linked Gmail account for the transcribed name, callback number, and Johnny/Verizon combination did not return corroborating mail. Full personal callback number, screenshot and original media have **not** been committed to this public repository. Treat as a separate inbound-contact lead, **not a completed second meeting, partnership, or carrier authorization**. A follow-up technical discussion remains unverified.

## 2026-11-18 engineering continuation: replay hardening + backfill simulation

GitHub draft PR #2240 remains non-production. The offline LAN harness now binds acknowledgments to the SHA-256 of the **exact** authenticated encrypted envelope. Repeated delivery of identical bytes is idempotent; reusing the same message ID for different valid ciphertext is rejected with HTTP 409. Queue files/directories are required to be private regular files, reducing symlink/unsafe-file ambiguity. Tests exercise the conflicting message ID and identical repeat receipt.

New `systemia/network/backfill-contact-lab.mjs` and `tests/network-backfill-contact-lab.test.mjs` model an intermittently available *authorized simulated* gateway as a durable fragment courier, distinctly acknowledging gateway custody and receiver delivery. Local Node 22 results: 2/2 tests PASS, including 26 fragments across two simulated windows, invalid gateway permission, manifest priority alteration, corrupted fragment, duplicate delivery and ack confusion. Git blob hashes of new files match local executed copies: `4b5179a35b3c4a499643f1f4c2ced184b2047334` and `c9713b03ada9f456e9e0f6d69097f93e7402fb2d`. New workflow `.github/workflows/network-saban-offline-lab.yml` executes only these two tests without FFmpeg installation.

The prior PR-head Forge CI failure came from a timeout (exit 124) during FFmpeg apt package installation in an unrelated general Forge check. It was not an observed failing Network test. This does NOT replace full Forge or security review. No physical second-device network trial, live Systemia DB write, satellite backhaul, production deployment, or Verizon outreach occurred.

Process-boundary backfill evidence: commit `83853b1b252dcff4629ff6e87c9083100a13b589` strengthened the software contact-window test so window two runs in a newly spawned Node process. Local executed Git blob `a257ece613e4e548ae725e53f51732ce22914b1d` matches the committed file. This supersedes the earlier test-blob reference in the Nov 18 notes while retaining the same 26-fragment / 2+24 simulated result.

## 2026-11-19 Push 03: physically witnessed field-test readiness

No production changes or actual physical-node communication were performed. The connected Evercraft plugin offers public-safe capability discovery but no live Systemia write or Penguin/NextGen shell execution. GitHub continues as the canonical source; the Systemia project record is updated in GitHub pending native ledger reconciliation.

**Implemented** `systemia/network/field-evidence-gate.mjs`: a consent-gated, no-network local tool that validates 0700/0600 files and existing hash-linked receipts, reads exact Git source revision and network module hashes, produces a self-attested Ed25519-signed redacted host observation, then verifies two independent observations against matching code snapshots and common encrypted-envelope message hashes. Sender `message.delivered` receipts now contain `envelope_hash`, allowing cross-node comparison with the receiver's `message.received` records. The review requires message delivery before and after a recorded peer-unreachable event and the receiver restarting its listener twice.

**Evidence**: `tests/network-field-evidence-gate.test.mjs` covers valid reconciliation, refusal of mutated self-signed reports, and refusal of tampered hash-linked logs. The existing outage test additionally checks the sender/receiver envelope hash match. Locally tested on Node.js 22; separate GitHub Actions Network CI success: `https://github.com/jgaethle10/forge-operator/actions/runs/44589061914`. Verified source Git blob: `165a175d55f51c406af3e12ff4a86557d3a7654e`; test blob `8b8e58264d05e8ce44da4da02055f12ee9ee904d`.

**Truth boundary**: a pair of signatures proves consistency of records held by the two signing keys, not independent identity, independent physical machines, proof of real upstream internet outage, radio range, battery endurance, real gateway, live network coverage, or emergency preparedness. It labels these as unverified. Independent physical witness and observed transport/link evidence remain required; never make a field certification from CI or self-attestation.

**Next operator gate**: execute the previously documented authorized isolated LAN exercise on Penguin/NextGen from the same clean branch SHA, collect both private per-node observations with `field-evidence-gate.mjs capture`, compare with `review`, and attach separate witness records for hardware uniqueness, actual WAN isolation, power source, interface reachability, and measured timings. Do not alter host networking/firewall or auto-enroll devices to make a test succeed.

## 2026-11-19 Push 04: harden field-evidence truth and topology readiness

The last completed pre-push Forge run at commit `6972c33f3df42eaa830ba38ac220d5f195ffea83` finished successfully, alongside ten other workflows. This **does not** establish a field network.

Identified false-positive risk: the signed evidence reviewer could count repeated deliveries of one message as multiple independent deliveries, or count two B listener startups that both predated the outage as valid recovery. The reviewer now checks unique message IDs and receiver acceptance, actual per-node event order, the second-message queue, A unreachability between deliveries, and B restart **between its accepted messages**. New negative tests re-sign misleading synthetic reports with valid local Ed25519 fixture keys; signature validity alone does not allow those records through.

Added `systemia/network/field-topology-preflight.mjs` and `tests/network-field-topology-preflight.test.mjs`. The tool reads only local interfaces and guest-environment hints, rejects loopback/public/unassigned IP binds, and emits redacted classifications. It performs zero packet/network probes, does not touch production host settings, and cannot claim another device is reachable. It flags WSL/Crostini NAT uncertainty instead of silently reconfiguring a firewall or router.

Local Node.js 22 regression: **5 PASS, 0 FAIL** across four test files. GitHub branch/CI review is distinct and may lag latest document commits. No live Node001/Node002 shell access, physical outage proof, online carrier access, satcom, or live Systemia DB update was performed; PR stays draft.

## 2026-11-25 operator-reported live Windows-to-WSL relay response

The operator provided terminal output from **Penguin Linux**, after running an operator-initiated temporary HTTP relay on NextGen:

```text
$ curl --noproxy '*' --connect-timeout 3 --max-time 8 http://<NextGen-Windows-LAN-IP>:47825/bridge-probe
EVERCRAFT_BRIDGE_CONFIRMED
```

This **operator-reported** live output is consistent with the short-lived Windows relay accepting a LAN HTTP request and returning the success token only after its localhost HTTP request to a NextGen WSL test backend returned HTTP 200. Prior operator-shared independent checks had already established (a) Penguin-to-NextGen Windows ICMP and TCP and (b) Windows-to-WSL localhost HTTP. The relay script had earlier suffered a JavaScript/PowerShell backtick syntax issue, which was corrected before this successful request.

**Verification and limitations:** The NextGen process's corresponding `WINDOWS_FORWARDED_TO_WSL` and `WSL_RECEIVED_FROM_WINDOWS` logs had not yet been supplied at the time of recording. The evidence is a user-provided terminal transcript, not machine-attested provenance. Do not claim complete two-sided receipt corroboration yet. The transit does not involve end-to-end Saban secure-envelope payloads, production relay identity, resilience to internet outage, physical peer cryptographic identity, satellite access, or integrated Kaidance runtime. The test used a temporary operator-run LAN relay with synthetic data; it is not a deployed service. No private IPs, keys, secrets, or raw host captures are committed here.

**Next gate:** corroborate the paired NextGen logs, then run the consented end-to-end encrypted Saban field-outage experiment and save signed self-attested receipts. Do not promote this to physical outage recovery until the WAN-isolation and interruption/recovery steps are witnessed.
