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

## What is *not* verified or built

- **No LAN access, hotspot, phone-to-phone discovery, Wi-Fi Direct, BLE, RF link or real audience reach.** To serve nearby phones, design a separate opt-in authenticated LAN adapter, hardware isolation, interference analysis, controlled routing, and bench tests with actual phones.
- **No radio station live source, streaming path or audio ingest.** The current demo only serves a test WAV that is already on disk. Real station audio needs source custody, rights, an approved ingest path and resilient playback.
- **No actual station signature or consent:** the synthetic signing key demonstrates cryptographic verification mechanics, not a station approval. Operational rights and editorial approvals must be independently authenticated.
- **No FM, translator, EAS, NOAA, 911 or licensed broadcasting control.** KZFR has not agreed to any Network installation and is only a prospective partner from a separate website bid.
- **No tested UPS duration, station power, multi-node sync, clock rollback resilience, client isolation or physical outage field receipt.** A local wall-clock assumption is not a trusted time source; next version must address anti-rollback/expiry across real power cycles.

See COMMUNITY-BROADCAST-CONTINUITY.md for the separate licensed-station FM continuity track and future field tests. This prototype cannot be represented as an emergency radio system.

## Review and acceptance

Run npm run test:community-radio-offline. The test suite generates isolated station fixtures, Ed25519 keys and valid locally synthesized WAV audio, checks the server over actual loopback HTTP, rejects forged content, rights gaps, expiry, malformed audio, file symlinks, traversal, mutations, and post-start corruption. The root Forge check also runs it. GitHub CI result is separate evidence from local tests.

The next gate is a consented, isolated two-device LAN playback experiment with an external network disconnected, timed freshness and measured battery runtime. It requires a fresh independent test record, not an inference from this prototype.
