# Community Radio Continuity: local offline portal proof

**Status: prototype, not public service, licensed FM backup, station-approved deployment, or safety guarantee.** Engineering mission [#1353](https://github.com/jgaethle10/forge-operator/issues/1353).

## One-command local demonstration

From a Node 22+ checkout:

    npm run test:community-radio-offline
    npm run demo:community-radio-offline

The demo prints a URL bound exclusively to **127.0.0.1**, visible only from the same computer. Open it in that computer's browser to read a signed example bulletin and play a self-generated 440 Hz WAV tone. The demo station and editorial references are **synthetic test fixtures**. The demo creates an ephemeral Ed25519 key pair and deletes its temporary package when stopped. It makes no HTTP requests to external hosts, is not associated with KZFR, and neither transmits radio nor makes a real emergency announcement. Its demo bulletin expires after 20 minutes. Press Ctrl+C to close and clean up.

## Real integration requirements

The module at systemia/network/community-radio-offline-portal.mjs exposes verifyLocalRadioPackage({dir,publicKey,now}) and startLocalRadioPortal({dir,publicKey,now,port}).

Its signed package contains:
- bulletin.json with outer schema evercraft.broadcast.signed-local-bulletin.v1;
- signed payload schema evercraft.broadcast.local-bulletin.v1, station name, title, message, signed approval/expiration timestamps, editorial and distribution-rights references;
- optional audio file with a signed SHA-256 digest;
- detached Ed25519 signature over JSON.stringify(signed_data) bytes using a **separately provisioned, station-trusted public key**. A key included in an untrusted package never becomes trusted.

The package and audio size limits, filename boundaries, hash, signature and expiration are enforced per request, including range audio GETs. HTML is escaped; the HTTP origin permits only GET and HEAD for exactly /, /audio, and /health. Responses disable browser caching and reject embedding or script execution. The process binds to localhost only. Expired, tampered or otherwise untrusted packages fail closed to HTTP 503.


## Opt-in local LAN experiment (synthetic only)

The original loopback command above is unchanged. A **separately opted-in** test may now expose an ephemeral, synthetic-only listening page on a single explicitly chosen RFC1918 IPv4 address assigned to the operator's own current LAN interface. The operator must supply both a private interface and an explicit acknowledgment:

    npm run demo:community-radio-offline -- --lan-lab=192.168.1.50 --consent-to-local-sharing

Replace the example IP with the actual private IPv4 **assigned to your own computer**. Never copy the example blindly. Only use on an isolated network that you control and are permitted to share test audio over. There is no generic 0.0.0.0 binding, public-IP fallback, port-forwarding, gateway manipulation, UPnP, station connection, discovery advertising or persistent service enrollment. The CLI prints a one-time join URL for a second phone connected to the same authorized local network. The join URL creates a short-lived HTTP-only browser cookie before the page and locally synthesized WAV can be fetched. Default trial ends in 10 minutes (maximum 15 minutes), and Ctrl+C stops it sooner.

**Security limitations:** this uses ordinary HTTP, so the join link, cookie and synthetic audio could be observed by people with access to the LAN. Treat the join URL as a temporary bearer secret. It is **not device identity verification or a production authorization system**. Do not use on hostile/shared networks, or with genuine station content, licensed feeds, emergency messages, private telemetry or customer hardware. The package must be explicitly marked as synthetic in its signed data, and must display the words Simulated and Simulation. Any real station service requires authenticated identity, HTTPS or mutually authenticated transport, rights/provenance verification, signed audit receipts, clock rollback resistance and independent security review.

**Platform reality:** a Chromebook Linux container or Windows WSL2 guest may be NAT-isolated from the phone even when the private IP is visible inside the guest. This demo never changes host forwarding or firewall rules automatically. A laptop running Linux natively or another operator-approved, isolated native host is preferable for the first two-device experiment. If an operator changes host networking, that requires separate explicit approval and security review.

### Physical trial evidence checklist

Record the tested host/device models and OS, isolated network identity, LAN IPv4, selected private interface, internet-disconnect evidence, join success on second phone, downloaded WAV hash, real audio playback, response after approval expiry, response after consent/session stop, client disconnect, failure after source corruption, power source and **measured** battery runtime, exact UTC timing, code SHA and rollback. Report Wi-Fi coverage as observed only at measured positions. No field receipt means no claim of neighborhood coverage, emergency readiness, FM broadcast, station integration or battery endurance.

Automated suite: npm run test:community-radio-lan-lab. On GitHub-hosted runners, the positive private-interface HTTP test runs only when an assigned RFC1918 interface exists; its outcome is not a substitute for physical second-device testing.

## Clock rollback and restart guard (software integrity only)

The offline portal and synthetic LAN adapter now accept an optional `clockGuard` returned by `createCommunityRadioClockGuard({stateDir, initialize, now})` from `community-radio-clock-guard.mjs`. When provided, every signed-bulletin request observes the clock against a locally persisted UTC high-water mark. A clock rollback larger than one second, missing/corrupt state or weakened state directory/file permissions blocks content (HTTP 503). The demo always creates an ephemeral private clock guard for its run. The local guard's unit tests prove restart behavior *when the same private state directory survives the restart*.

An actual persistence experiment must use a persistent absolute operator-owned directory (0700), initialize it explicitly once, reuse it without wiping it on restart, and test a clock rollback. The demo's temporary state is deleted when the demo stops; that alone **does not prove crash or reboot continuity**. This guard mitigates accidental clock rollback. It is not a secure time source, TPM-backed anti-rollback storage, tamper-resistant state, trusted NTP, or a sudden-power-loss certification. An attacker who can replace operator-owned state or manipulate system time and storage could still defeat it. Production must use independently anchored time and secured persistent state.

## Field evidence review: do not manufacture physical receipts

The template at `systemia/network/fixtures/community-radio-field-attestation-template.json` starts with blank values. Populate it only from an authorized **real two-device test**, using reference links to actual screenshots, measured results and the code revision. For review on an operator-owned computer, use:

    npm run radio:field-review -- /absolute/path/to/operator-attestation.json

This is an offline, read-only, bounded JSON check. It returns each missing criterion and a digest of the review output. Even when every self-reported field is present, its **maximum state is `operator_attested_pending_independent_witness_review`**. It never certifies field performance, safety suitability, station authorization, FM operation, or emergency reliability. The review does not inspect footage or validate the truth of operator-supplied references; a separate independent witness, rights review and physical measurements are mandatory before publishing results.

For the first trial, do not include actual station music, private identities, precise sensitive addresses or equipment credentials. Use only the synthetic test audio. Ensure isolated operator-owned networking, distinct phones/computers, upstream Internet disconnected on both, and no modifications to public radio, emergency alerts or station systems.

## What is *not* verified or built

- **No real neighborhood field proof, hotspot provisioning, phone-to-phone discovery, Wi-Fi Direct, BLE, RF link, or observed audience reach.** A separate synthetic-only, explicitly opted-in private IPv4 LAN lab exists, but it lacks production authentication, hardware isolation, range evidence and actual two-device receipts. Bench tests with real phones remain mandatory.
- **No radio station live source, streaming path or audio ingest.** The current demo only serves a test WAV that is already on disk. Real station audio needs source custody, rights, an approved ingest path and resilient playback.
- **No actual station signature or consent:** the synthetic signing key demonstrates cryptographic verification mechanics, not a station approval. Operational rights and editorial approvals must be independently authenticated.
- **No FM, translator, EAS, NOAA, 911 or licensed broadcasting control.** KZFR has not agreed to any Network installation and is only a prospective partner from a separate website bid.
- **No tested UPS duration, station power, multi-node sync, securely anchored clock, client isolation or physical outage field receipt.** A local wall-clock assumption is not a trusted time source; next version must address anti-rollback/expiry across real power cycles.

See COMMUNITY-BROADCAST-CONTINUITY.md for the separate licensed-station FM continuity track and future field tests. This prototype cannot be represented as an emergency radio system.

## Review and acceptance

Run npm run test:community-radio-offline. The test suite generates isolated station fixtures, Ed25519 keys and valid locally synthesized WAV audio, checks the server over actual loopback HTTP, rejects forged content, rights gaps, expiry, malformed audio, file symlinks, traversal, mutations, and post-start corruption. The root Forge check also runs it. GitHub CI result is separate evidence from local tests.

The next gate is a consented, isolated two-device LAN playback experiment with an external network disconnected, timed freshness and measured battery runtime. It requires a fresh independent test record, not an inference from this prototype.

## Second-device read-only network receipt

A field operator can now collect an independent **HTTP-observation receipt** by running the probe from a second operator-controlled computer attached to the same authorized, isolated network. The host starts the synthetic LAN lab described above; the second machine checks the HTTP invitation, access control, signed synthetic bulletin page, WAV range request, and complete WAV bytes. This helps establish data transfer over a private LAN but does not prove a distinct physical device, actual audible playback or upstream internet loss. A separately witnessed physical trial is still necessary.

On the second computer with a Node 22+ checkout, run:

    npm run radio:second-device-probe -- --acknowledge-local-test --output=/absolute/path/new-listener-probe.json

The command reads the ephemeral join URL **from standard input, never a command-line argument**. Paste the temporary join URL printed by the host, press Enter and send EOF (Ctrl+D on most Unix terminals). Use a new output path; no existing file is overwritten, and the output is created with mode 0600. If no output is specified, the probe prints JSON to standard output. Neither path contains the bearer token or cookie. Do not post the join URL, shell captures or exact private networking details publicly.

The verifier does not fetch any hostnames or public addresses: it requires an explicit HTTP URL to an RFC1918 private IPv4 with a port and exact /join/64hex route. All requests disallow redirects, time out, and cap their response sizes. The receipt reports real HTTP statuses and audio/page hashes. It explicitly labels upstream loss, separate physical hardware, auditory playback, power runtime, and broadcast authority **unverified**. This is a synthetic-only lab protocol over **unencrypted HTTP**, so it is unsuitable for sensitive environments.

The operator must still separately record genuine footage or direct eyewitness evidence of playback, a measured no-internet condition on both devices, approval/expiration and server-stop negative tests, and measured battery performance. See the blank field-attestation template and the independent witness requirements. If the host is a Chromebook Linux guest or WSL2 instance, its private address may not be reachable by a second machine; do not modify firewall/router/forwarding without separate operator approval.
