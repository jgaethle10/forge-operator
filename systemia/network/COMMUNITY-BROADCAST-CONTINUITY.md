# Evercraft Community Broadcast Continuity | v0 engineering contract

**State:** software advisory prototype only. **Not installed, operating, endorsed or requested by KZFR or any broadcaster.** Systemia mission: [#1353](https://github.com/jgaethle10/forge-operator/issues/1353).

## Purpose
Keep reliable, locally available, station-approved information reachable when an internet, power or distribution path fails. A human-controlled community-radio website should be an entry to meaningful continuity, not implicit consent to Evercraft compute sharing. Client opt-in to hosting, access or Network membership is separate from any website contract. No station licenses or broadcasting authority transfer to Evercraft.

## Two independent continuity tracks

### 1. Licensed FM / on-air continuity (station-controlled)
The station's qualified broadcast engineer inventories main/auxiliary transmitter facilities, audio console, studio-to-transmitter link, power/batteries/generator, monitoring, antenna path and EAS equipment. Planned fallback paths must have a licensee-approved chain and be tested by the station. Any temporary facility or emergency antenna use is subject to the specific FCC authorization/notification rules, including 47 CFR 73.1680 and 73.1635. EAS equipment, tests and emergency message relay follow 47 CFR Part 11. **Evercraft does not key a transmitter, change frequency/power, originate EAS messages or promise continued FM coverage.**

### 2. Authorized, genuinely local listener access (Evercraft candidate)
With separate written consent, an enrolled node could host a local Wi-Fi/LAN listener portal. It needs on-site power, verified local listener reach, station-owned audio input (not a remote upstream stream when internet is down), permission to distribute copyrighted programming, and a station-controlled stop/revoke function. During an outage, a locally cached, integrity-checked and still-valid *station/editor-approved* informational recording may remain available even when no live audio source does. All notices must say when they were approved. Expired material must stop, not masquerade as current emergency information.

**No internet** does not mean **no electricity**, **no studio audio**, or **FM on air**. These are separate measured claims. Ordinary Wi-Fi hotspot reach is limited to participating devices near the site. Offline clients must actually join that network. Physical access range, antenna, UPS runtime and failover behavior require hardware field tests.

## Engineering acceptance levels
- **V0 (this PR):** deterministic non-actuating planner with false-positive checks; tests run using fabricated fixtures only. Its `candidate_*` states mean *eligible for operator-supervised experiment*, not ready-to-deploy, broadcast-live or safety-certified.
- **V1 lab:** signed provenance for observations, fresh audio packets, verified offsite/local cache hashes and expiration, an accessible captive/local portal, station-editor approval workflow, failover audit receipts, tamper/clock/rollback proof and emergency pretext rejection.
- **V2 field:** approved pilot on isolated non-broadcast equipment; actual browser/device playback over local Wi-Fi with upstream internet unplugged; measure watts, runtime, station-feed ingest, audio latency and hotspot coverage; test power failures, clock rollback, cache expiry, recovery and remote revocation; no production audio without written rights.
- **V3 station ops:** engineering/authority review for RF-adjacent telemetry and integration with *existing licensed transmitter procedures* and EAS, plus station-managed drills and a separately priced continuity SLA. No automatic RF switching absent specific licensee-authorized design and independent safety tests.

## V0 planner contract
`planCommunityBroadcastContinuity({station,node,paths,sources,now})` outputs a SHA-256-digested advisory decision with an explicit hold reason or a *candidate for controlled local trial*. Inputs are operator-supplied and **not** authenticated evidence. The planner verifies that references to written station approval, device enrollment, power autonomy, rights clearance, locally observed path, and fresh source are present. Recorded local bulletins require a digest, cache-integrity assertion, editorial approval, approval time and expiration within 24h. Every output marks deployment, RF transmission, EAS handling, and independent audience-reach verification as **false**. There are no device-control or publishing APIs.

Run: `node --test tests/community-broadcast-continuity.test.mjs`.

## KZFR candidate and commercial boundary
KZFR's publicly available online listening and archive service is Creek-hosted. No assumption that its audio output or streaming rights can be reused by Evercraft. KZFR has received a website redesign proposal; that is **not** approval for Network software, server access, station audio redistribution or FM changes. This continuity concept is an optional future demonstration only if KZFR chooses to explore it. The original $11,800 website bid remains separate.

## Sources and engineering checklists
- [47 CFR 73.1680 Emergency antennas](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-C/part-73/subpart-H/section-73.1680)
- [47 CFR 73.1635 Special temporary authorization](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-C/part-73/subpart-H/section-73.1635)
- [47 CFR Part 11 Emergency Alert System](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-11)
- [KZFR listen](https://kzfr.org/listen)
- Existing network groundwork: `OFFLINE-CONTINUITY.md`, `REMOTE_OPERATOR.md`, `DURABLE-CONTINUITY-STATE.md`

**Never conflate simulation, receipt, hardware demo, commercial permission, actual radio coverage, public-safety assurance or real-world deployment.**
