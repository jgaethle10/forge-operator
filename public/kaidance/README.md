# KAIDANCE | Public Observatory (Build 01)

KAIDANCE is Evercraft's existing Collider operating cadence, **not a new scheduler or a simulated workforce**. This public home makes that rhythm observable. The desired source of truth is Systemia → the resident KAIDANCE Collider → existing private `evercraft.kaidance.pulse.v1` → explicitly authorized read-only public projection → owned public edge → browser.

## What is implemented

- `public/kaidance/index.html`: distinctive animated Systemia/KAIDANCE observatory with one-button 9:16 portrait view and optional browser fullscreen for screen capture.
- `app.mjs`: reads `./pulse.json` from **the same owned public origin** every 20 seconds, strictly validates freshness and attestation, and only triggers the collider flash after a **new verified cycle number** arrives. An orbiting graphic by itself is **artwork**, not evidence of a running cycle.
- Public development records are independently read from the existing `public/live/work-source.mjs` GitHub-only normalizer. Records carry exact links and timestamps. This is **not** private mission telemetry, a sales record, or proof of a Systemia job.
- `systemia/collider/public-projection.mjs`: **pure** allowlist projection from the existing safe pulse. It cannot write public files. It omits deployment receipts, node IDs, continuity, holds, mission sources, private evidence and internal routes.
- `systemia/yard/kaidance-public-publisher.mjs`: one-shot, owner-run publisher that requests the pulse through Yard's authenticated deployment route, checks a private, restricted, time-limited publication policy, rejects stale and regressed cycles, and atomically writes only `kaidance/pulse.json` inside the exact approved public root.
- `tests/kaidance-public-observatory.test.mjs`: privacy, freshness, attestation, provenance and no-demo-data checks.

## Release gate, in order

1. Run `node --test tests/kaidance-public-observatory.test.mjs` and the existing KAIDANCE proofs: `node systemia/collider/proof.mjs` and `node systemia/collider/pulse-proof.mjs`. These are **source-level** tests, not proof of field deployment.
2. On a trusted Evercraft-owned runtime, independently verify the resident service, real cycle receipt, and identity. Verify a real instance of `evercraft.kaidance.pulse.v1` using an authenticated **private** channel. Do **not** scrape private `runtime.mjs` responses into public HTML.
3. Obtain explicit operator approval on the trusted owner-controlled runtime. Create a **private** local policy file with mode 0600, owned by the publisher's service account, and exact deployment/public-root scope. This example describes the schema only; it is not an authorization or a real approval:

   ```json
   {
     "schema": "evercraft.kaidance.public-publish-policy.v1",
     "enabled": true,
     "deployment_id": "YOUR-AUTHORIZED-KAIDANCE-DEPLOYMENT",
     "public_root": "/srv/evercraft-public",
     "operator_approval_ref": "approved:YOUR-PRIVATE-CHANGE-RECORD",
     "approved_at": "2026-11-19T00:00:00Z",
     "expires_at": "2026-12-10T00:00:00Z"
   }
   ```

   A local policy is an operating-control file, **not cryptographic proof of who approved it**. The owner must independently verify the approval in Systemia's control process. The policy expires within 30 days. Never commit an enabled policy file to GitHub, and do not place it in the public root.

4. On the actual authorized Yard host, run a single read-only pulse acquisition and narrow public export:

   ```sh
   node systemia/yard/kaidance-public-publisher.mjs \
     --state-dir /private/yard \
     --deployment-id YOUR-AUTHORIZED-KAIDANCE-DEPLOYMENT \
     --policy-file /private/kaidance-public-policy.json \
     --public-root /srv/evercraft-public
   ```

   The target directory must already exist and be served by the approved **owned Evercraft edge** as the same-origin `/kaidance/pulse.json`. The publisher does not install services, modify network routing, upload files to GitHub, or open a listener. A previously published value becomes visibly stale if the next publication fails. After the operator confirms the host setup, schedule the one-shot command every **60 seconds**, using the existing owned resident scheduler. The five-minute cycle remains controlled by KAIDANCE; the 60-second publisher only observes it. Revoke by disabling/expiring the private policy and removing the public output, rather than keeping an old file indefinitely.

5. From an **independent network** (not the same machine that publishes), check the public HTTPS source with:

   ```sh
   node scripts/kaidance-public-readback.mjs --origin https://YOUR-APPROVED-EVERCRAFT-ORIGIN
   ```

   The canary targets exactly `https://<approved-origin>/kaidance/pulse.json`, refuses redirects, checks payload size, source age, heartbeat age, coverage receipt, and independently verified field attestation. It never contacts private Yard. Success proves that **one** externally reachable public pulse was fresh and verified at check time, not that future five-minute cycles are guaranteed. Repeat across a second observed real cycle. Confirm 20-second browser polling, mobile controls, and that the visual flashes only on new verified cycles. Only then advertise a LIVE Systemia pulse.

Until a verified public export exists at its deployed origin, the page must show **HEARTBEAT NOT CONNECTED**. It intentionally has no `pulse.json` committed to GitHub. The visual remains a branded motion environment with accurate source labels.

## TikTok LIVE

In a screen-sharing broadcast setup allowed by the user's TikTok account and device, open the approved public URL, choose `9:16 LIVE VIEW`, and screen-capture the page with a phone/desktop live production workflow. This app is a **viewer**, not a TikTok broadcaster, RTMP gateway, OBS plugin, or streaming service. Keep source labels visible. When the pulse is unconnected/stale, describe it as the *KAIDANCE observatory preview with recorded public development receipts*, not live Collider execution. Never expose the private operator dashboard during a stream.

## Boundary and ownership

GitHub is canonical source and review. Systemia routes orchestration. Owned Yard/Compute/edge perform the running work and publication. There is no Base44 dependency or third-party runtime required by the page. Public GitHub API calls only retrieve already-public metadata, and the UI does not require visitor login. Do not imply all Evercraft systems cycle every five minutes merely because KAIDANCE's target is 300 seconds.

## Next

Operate and attest the one-shot Yard publisher on a real enrolled Compute deployment, verify the owned-edge route externally, add a revocable signed publication receipt and durable offsite freshness monitor. Then expand the projection only through reviewed, allowlisted public event types with evidence links.
