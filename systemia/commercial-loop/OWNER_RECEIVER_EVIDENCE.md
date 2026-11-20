# Commercial Loop | real owner-receiver custody evidence

**Purpose:** Connect the existing commercial-order read model to real, locally held NextGen Wing Courier bytes and Passport intake records. Unlike synthetic object fixtures, this adapter reads the actual 0600/0700 custody package on the approved receiving machine, hashes every original byte again, and requires a separately authorized read of the exact stored Passport/Intake candidate.

**Status:** source implementation and owner-private tests only. It is not installed on NextGen, cannot remotely view Harbor/NextGen, and does not certify a client preview, revenue or delivery.

## Source contracts, not new infrastructure

- `systemia/wing-courier/envelope.mjs` writes a local `<package-id>/receipt.json` with schema `evercraft.systemia.wing-receive-receipt.v1`, 12 source filenames/byte sizes/hashes, `AUTHENTICATED_BYTES_RECEIVED` and `privateCustodyVerified:true` after signed import.
- `systemia/wing-courier/resident.mjs` writes `intake-offer.json` only after Passport-gated Intake Fabric admission of an **inert candidate**. It does not grant jobs, rendering or customer sends.
- `systemia/intake-fabric/intake.mjs` exposes `getCandidate(...,{actor_ref})` protected by Passport `intake.read`. The adapter uses that real read and compares the same source event key, content fingerprint and attachment count produced by `candidateForVerifiedWingReceipt()`.
- `systemia/commercial-loop/commercial-loop-read-model.mjs` projects the next safe stage. No separate live order database, private transport, public API or backend is created.

## Owner-only dry run

On the **actual owner-approved NextGen/Fallen receiver**, with a private order descriptor and existing private Courier/Passport/Intake state:

```bash
node systemia/commercial-loop/owned-receiver-evidence.mjs \
  --order /real/private/fallen/order.json \
  --custody-root /real/private/wing-courier/received \
  --intake-dir /real/private/systemia/intake \
  --passport-dir /real/private/systemia/passport \
  --read-actor operator:approved-commercial-audit
```

Paths are illustrative only. The operator must obtain the actual paths from its approved host state and ensure `intake.read` is an independently granted Passport scope. Do not create a grant simply to force a green status. The command requires the same non-root owner, real local receiver hostname, protected regular files and directories, no symlink at custody root/package, one hardlink per original, valid manifest, and exclusive package contents. It checks each file's byte size, SHA-256 and concurrent modifications.

Output is a redacted JSON report: stage, next internal action, holds, counts and safety boundaries. It prints no buyer name, Page/thread ID, original filenames, asset hashes, private file paths, source video, credentials or source material. If package does not exist, output stays `AWAITING_PRIVATE_CUSTODY`. If the source receipt or any asset changes, output is `CUSTODY_CONFLICT`. If owned source bytes are intact but no real Passport intake exists, output is `AWAITING_PASSPORT_INTAKE`; an unapproved `intake.read` actor or mismatched intake candidate returns `INTAKE_CONFLICT`. Only a corroborated, authorized intake candidate advances to `AWAITING_PRODUCTION_ASSIGNMENT`, never automatically to running production.

The read-only adapter **does not cryptographically recheck the original encrypted sender signature**. That signature is verified at the original Courier import. The adapter trusts the private owner-host custody root and rechecks its files. If the receiving host itself is compromised, this is not a remote independent attestation. The exact operator identity and Passport grants remain essential.

## Operational separation

In the parallel bridge thread, real Penguin Courier on 8851 and authenticated Fallen Fabric inbox are reported verified. Harbor private signed enrollment and two-way synthetic ACK receipts are not yet proven complete. This tool neither provisions broker tokens nor changes Harbor's receiver. It must not run on GitHub Actions against actual customer files or use CI fixtures as proof of operational deployment.

The other thread's merged owner-source work already includes Harbor's recipient installer, signed encrypted credential enrollment, One-Body planning and durable Goal Runtime staging. This adapter adds only a trustworthy local **commercial-order status read** so the eventual Harbor/Systemia/Fallen agent can show where the work stopped without lying about what was accomplished.

No live customer media may be moved until identities, consent/rights and receiving source verification are approved. The rejected commercial preview remains under founder exact-file review and customer-release freeze. Payment is still after the client's approval.

## Regression test

`node --test systemia/commercial-loop/*.test.mjs`

The existing `.github/workflows/evercraft-commercial-loop.yml` already runs the glob and also tests the Courier intake and Harbor guard. Tests contain **synthetic byte fixtures only**. CI never opens the owner's real private folders.

Tracking: #2280 commercial delivery, #2294 live Courier, #2284 incident/release hold, #2416 company-wide coordination.
