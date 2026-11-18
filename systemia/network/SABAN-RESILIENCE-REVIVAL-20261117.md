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
