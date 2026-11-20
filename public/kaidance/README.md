# KAIDANCE | Public Observatory (Build 01)

KAIDANCE is Evercraft's existing Collider operating cadence, **not a new scheduler or a simulated workforce**. This public home makes that rhythm observable. The desired source of truth is Systemia → the resident KAIDANCE Collider → existing private `evercraft.kaidance.pulse.v1` → explicitly authorized read-only public projection → owned public edge → browser.

## What is implemented

- `public/kaidance/index.html`: distinctive animated Systemia/KAIDANCE observatory with one-button 9:16 portrait view and optional browser fullscreen for screen capture.
- `app.mjs`: reads `./pulse.json` from **the same owned public origin** every 20 seconds, strictly validates freshness and attestation, and only triggers the collider flash after a **new verified cycle number** arrives. An orbiting graphic by itself is **artwork**, not evidence of a running cycle.
- Public development records are independently read from the existing `public/live/work-source.mjs` GitHub-only normalizer. Records carry exact links and timestamps. This is **not** private mission telemetry, a sales record, or proof of a Systemia job.
- `systemia/collider/public-projection.mjs`: small allowlist projection from the existing safe pulse. It omits deployment receipts, node IDs, continuity, holds, mission sources, private evidence and internal routes. Source readiness is not public release authorization.
- `tests/kaidance-public-observatory.test.mjs`: privacy, freshness, attestation, provenance and no-demo-data checks.

## Release gate, in order

1. Run `node --test tests/kaidance-public-observatory.test.mjs` and the existing KAIDANCE proofs: `node systemia/collider/proof.mjs` and `node systemia/collider/pulse-proof.mjs`. These are **source-level** tests, not proof of field deployment.
2. On a trusted Evercraft-owned runtime, independently verify the resident service, real cycle receipt, and identity. Verify a real instance of `evercraft.kaidance.pulse.v1` using an authenticated **private** channel. Do **not** scrape private `runtime.mjs` responses into public HTML.
3. Obtain explicit operator approval for a public pulse stream. Stage only the narrow projection, not the source. Example:
   ```sh
   node systemia/collider/public-projection.mjs \
     --input /private/approved-safe-kaidance-pulse.json \
     --output /owned-approved-export/kaidance/pulse.json \
     --approval-ref approved:kaidance-public-pulse-001
   ```
   The CLI checks the **presence and shape** of an approval reference; it is not an authorization system. The operator must verify the actual authorization separately. Avoid keeping a confidential safe-pulse file beside the public projection.
4. Publish the reviewed `public/kaidance/` static files on the **owned Evercraft edge** and let the separately authorized publisher atomically replace `kaidance/pulse.json` on the same origin. Output must be immutable per write, permission-limited, rate-limited at public ingress, and explicitly revocable. Do not expose private paths as static aliases, use a client-side API key, or attach access to job execution.
5. Check an **external**, unauthenticated public readback, the actual pulse freshness and another completed cycle. Confirm 20-second polling, stale-state handling, mobile controls, and that live flashes happen **only on new verified cycles**. Only then advertise this as a live Systemia pulse.

Until step 4, the page must show **HEARTBEAT NOT CONNECTED**. It intentionally has no `pulse.json` committed to GitHub. The visual remains a branded motion environment with accurate source labels.

## TikTok LIVE

In a screen-sharing broadcast setup allowed by the user's TikTok account and device, open the approved public URL, choose `9:16 LIVE VIEW`, and screen-capture the page with a phone/desktop live production workflow. This app is a **viewer**, not a TikTok broadcaster, RTMP gateway, OBS plugin, or streaming service. Keep source labels visible. When the pulse is unconnected/stale, describe it as the *KAIDANCE observatory preview with recorded public development receipts*, not live Collider execution. Never expose the private operator dashboard during a stream.

## Boundary and ownership

GitHub is canonical source and review. Systemia routes orchestration. Owned Yard/Compute/edge perform the running work and publication. There is no Base44 dependency or third-party runtime required by the page. Public GitHub API calls only retrieve already-public metadata, and the UI does not require visitor login. Do not imply all Evercraft systems cycle every five minutes merely because KAIDANCE's target is 300 seconds.

## Next

Wire the operator-approved projection to the actual resident KAIDANCE safe pulse on owned Compute, issue signed/revocable publication receipts, add offsite independent readback and a durable freshness monitor. Then expand the projection only through reviewed, allowlisted public event types with evidence links.


## Build 02: repeatable, owner-approved heartbeat publishing

Build 02 adds the **one-shot** `systemia/collider/public-publisher.mjs` and the unauthenticated `systemia/collider/public-readback.mjs`. The publisher calls the real `YardOperator.getKaidancePulse(deploymentId)`. This is read-only: it never triggers a KAIDANCE cycle or a Systemia mission. The publisher requires all of the following:

- An existing, operator-managed approval file outside the served tree, owned by the executing user, with **no group/other read/write/execute permissions** (mode `0600`).
- `schema=evercraft.kaidance.public-publication-approval.v1`, `allow_publish=true`, a non-empty named approving operator, the exact deployment ID, exact canonical public root and an approval window no longer than 30 days.
- Real Yard verification reporting a currently resident, healthy Collider, valid coverage receipt, an independently verified field-attestation receipt, a new-enough observed timestamp and a completed cycle within 390 seconds.
- An existing owner-selected public root with a real non-symlink `kaidance/` directory. No public directory is installed, mounted or served automatically by this CLI.

The approval file must be created only after a legitimate operator has approved disclosure of these **aggregate counts**. The following is a **disabled specimen**; it must never be copied as an active approval without operator review:

```json
{
  "schema": "evercraft.kaidance.public-publication-approval.v1",
  "allow_publish": false,
  "approved_by": "OPERATOR_TO_BE_VERIFIED",
  "deployment_id": "YOUR_VERIFIED_KAIDANCE_DEPLOYMENT_ID",
  "public_root": "/YOUR/OWNED/PUBLIC/ROOT",
  "approved_at": "REPLACE_WITH_ACTUAL_ISO_TIMESTAMP",
  "expires_at": "REPLACE_WITH_ACTUAL_ISO_TIMESTAMP"
}
```

Once reviewed, file mode checked, and the existing Yard health independently verified, run a **single** approved export:

```sh
node systemia/collider/public-publisher.mjs \
  --yard-state-dir /ACTUAL/PRIVATE/YARD \
  --deployment-id YOUR_VERIFIED_DEPLOYMENT_ID \
  --approval-file /ACTUAL/PRIVATE/kaidance-public-approval.json \
  --public-root /ACTUAL/OWNED/PUBLIC/ROOT
```

This writes only `kaidance/pulse.json`, atomically, and returns a redacted receipt with a SHA-256 projection digest. The output file has no private device IDs, mission names, lease routes, receipts or evidence pointers. It may contain aggregate admitted and held counts. Do not place the approval file or private Yard directory in the webroot.

Example `systemd` **service/timer templates only** are under `systemia/collider/deploy/`. They are intentionally **not installed or enabled** by this repository. The owner must provision the actual service identity, directories, application files, access controls, systemd sandbox, and owned HTTPS public edge before scheduling 30-second projection refreshes. The timer refreshes the public copy, not the 300-second Collider itself. An operator can revoke publishing by disabling the timer, removing the private approval file, and removing the published `pulse.json`; the viewer will display the disconnected state.

Finally, from an external host with no private access or tokens, check:

```sh
node systemia/collider/public-readback.mjs \
  --url https://ACTUAL-OWNED-PUBLIC-ORIGIN/kaidance/pulse.json
```

This verifies HTTPS, the exact public route, valid JSON, fresh source and cycle times, a coverage receipt indication, and the field-attestation flag. It **cannot independently prove the provenance of those claims without trusted publication identity**, so the public origin and owned publisher remain essential trust boundaries. Use a signed publisher release and a separately recorded operator attestation for high-assurance audit. A valid external readback is only one of the launch conditions; test actual viewer behavior and multiple successive cycles as well.

In 9:16 view, the screen now includes a sourced GitHub engineering-event lower third that rotates independently of the Collider heartbeat. An animated orbit and recorded GitHub work do not imply new Collider execution.
