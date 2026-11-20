# One-body coordination | Wing Courier → Systemia → Saban → specialists

**Status: implemented source integration and synthetic coverage only. No automatic company-wide worker dispatch, source-media access, deployment or customer fulfillment is implied.**

Evercraft already has a canonical product registry (69 public products in the reviewed Nov 20 snapshot), a Saban multiplication registry (15 bounded software contracts), and shared Capability Mesh contracts (12 declared at that snapshot). We reuse these, never a second agent warehouse. Registry entries are **discoverability and code contracts**, not live deployment proof.

## Connected source-level handoff

When the authorized NextGen `Wing Courier` resident actually receives and verifies a Harbor-origin encrypted media package, it independently checks every locally owned source byte and then offers a **non-executable** candidate to the existing Passport-gated Systemia Intake Fabric. `systemia/wing-courier/intake-bridge.mjs` now invokes `systemia/one-company/courier-handoff.mjs` **only after** this intake succeeds and the private custody receipt includes `privateCustodyVerified:true`.

The returned owner-private `intake-offer.json` can include a `oneCompanyPlan` with:
- the **actual canonical** product keys, declared capability policies and Saban software registry IDs, not guessed department connections;
- the source-bound, bounded Saban **formation proposals** for `fallen-production` and, when actual audio/video exists, `forensiscope`, using the existing `admitMultiplicationRequest` helper as a **pure budget calculation**, never a worker allocation;
- a ForensiScope rights/local-source-validation **HOLD**, referencing its existing `authorized-source.mjs`. Current ForensiScope Capability Mesh policy explicitly says automatic media transfer is not approved. This projection **cannot** bypass that restriction;
- separate future stages for Fallen producer/QC, Evercraft Clip, Harbor authorized Messenger preview, Hudson privacy-safe observability, Kaidance heartbeat, Raven Nexus/Guardian review, Evercraft Payments and Shipping;
- source-only Portfolio Sentinel coverage for additional products that have not yet been given a specialist handoff. No unknown product is silently declared operational.

The output has no source filenames, source hashes, full source paths, customer text or private keys. It retains only opaque internal package/candidate IDs, counts and contract references inside the owner-private intake receipt. The actual media stays exclusively at the private receiving wing.

## Real integration defect corrected

The first receiver integration CI exposed a source-contract discrepancy: the existing Intake Fabric emits `receipt_hash` as a **`sha256:<64-hex>` string**, while the commercial loop's synthetic fixtures and new coordination plan had treated it as a bare 64-hex digest. We changed both readers and the regression fixtures to require the authoritative prefixed format. This prevents a real authenticated inbound candidate from being incorrectly rejected at the next workflow boundary.

## What it does NOT do

- Does not launch Saban, grant workers, query an LLM or open source files for ForensiScope.
- Does not import 69 products into every job. Routing is explicit, least-privilege and per-purpose.
- Does not admit a production job merely because the Intake Fabric accepted an inert candidate.
- Does not send a message, create checkout, move originals, publish a clip, or deliver a master.
- Does not treat product registry source presence, an anonymous HTTP 401, a GitHub issue, or a simulated receipt as live runtime authority.
- Does not relax the rejected-preview recovery hold in #2284.

## On the real first commercial

1. Harbor's existing GitHub reader can inspect pickup signal #2414 and reply with a bounded *non-secret* readiness acknowledgment, but this is not private transport or Passport authorization.
2. Complete owner-local broker/edge/Harbor and NextGen sender/receiver credentials and **a signed synthetic two-way transfer** first (#2294).
3. Register actual rights/consent to the original 12 files and confirm a valid Systemia Passport assignment. Harbor sends originals via **private encrypted** Courier (not GitHub), NextGen independently hashes 12/12 and creates receiver-signed custody.
4. Only then can the owner-private one-company plan appear from a **real** intake offer; the currently implemented stages merely help Saban/ForensiScope/Fallen/Clip/Payments operators identify the next separate authority gate.
5. ForensiScope still needs separately approved, locally admitted video/audio source and its actual compute/transcription readiness before analysis. Saban's proposal is not a lease.
6. Named Fallen production, real independent media QC, exact owner-reviewed preview, customer approval, provider-confirmed payment and Shipping remain separate.

## Test

`node --test systemia/wing-courier/*.test.mjs systemia/one-company/*.test.mjs`

This suite is included in the dedicated `Evercraft Wing Courier | encrypted handoff contracts` CI workflow for every change to either directory. Actual owner-machine source deployment and verified runtime receipts are a second, independent release boundary.

**Existing source modules reused:**
- `systemia/wing-courier/intake-bridge.mjs`
- `systemia/intake-fabric/intake.mjs`
- `systemia/passport/passport.mjs`
- `systemia/saban/admission.mjs` and `multiplication-registry.json`
- `systemia/capability-mesh/contracts.json`
- `registry/public-products.json`
- `systemia/forensiscope/authorized-source.mjs` (source validation interface referenced, no media access)

Owners: #2280 first-commercial production, #2294 actual authenticated Courier, #2284 preview release freeze, #2414 Harbor GitHub readiness pickup. This does not replace Systemia Organism's one-body or goal runtime.
