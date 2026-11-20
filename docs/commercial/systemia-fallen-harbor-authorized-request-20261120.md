# Authorized private asset-demand dispatch: Systemia → Fallen → Harbor

**State:** source-level operator adapter, not activated on any live host. Commercial recovery case remains frozen (#2284). This module never reaches Harbor itself.

## Why the request travels in reverse

The planned customer originals flow is **Harbor → Fallen**. To request them using the existing two-wing Courier without adding a third public broker identity, Systemia first authorizes an **opaque work-packet request** for a named owner-controlled Fallen operator. Fallen encrypts and signs the request to **Harbor** using the already supported reverse Courier direction `fallen → harbor`. Harbor independently verifies and acknowledges the package. Only after the private request is authenticated and Harbor's rights check passes can Harbor prepare the original customer files for the opposite direction.

This is a production-intake request, not a customer-facing commercial preview and not a fabricated Systemia mission.

## Added

`systemia/wing-courier/authorized-asset-demand-dispatch.mjs` prepares an encrypted request from an existing owner-private 0600 asset-demand candidate, guarded by the **actual owner-local Passport ledger**:
- actor `agent:systemia:...`, product `evercraft-wing-courier`, scope `asset.request`, resource `asset-demand:<opaque-caseRef>`, and the exact request SHA256 fingerprint;
- active single-use Passport action permit, consumed before preparation; revoked, expired, wrong-resource, cross-actor, reused permits HOLD;
- independently pinned Fallen Ed25519 signer and Harbor X25519 recipient public key fingerprints. No private key ever goes into the broker or GitHub;
- 0700 owner-private outbox, no overwrite or symlink replacement, encrypted `work_packet` envelope with only the opaque request JSON, no customer originals;
- output `.wing` and private `.wing.json` for existing `systemia/wing-courier/client.mjs push` on **authorized** owner-local runtime.

The status returned deliberately reports `brokerUploadPerformed:false` and `harborReceived:false`. Preparing a ciphertext packet is not proof of a live broker connection or a remote Harbor acknowledgment.

## Integration still needed on real machines

1. Verify actual owner-private Systemia Passport authority and the authentic commercial case reference, then stage the 12-source asset-demand candidate via `private-asset-demand.mjs`. The GitHub branch or generic LLM text cannot issue a Passport grant.
2. Enroll and pin Harbor's real receiver X25519 public key via the authenticated owner-private identity channel. Fallen's Ed25519 private signer remains on NextGen.
3. On authorized Fallen runtime, mint and consume the scoped 15-minute-or-less Passport action permit and call `prepareAuthorizedHarborPickup`. Use the existing `client.mjs push` only when protected Fabric authentication has been verified. The operator must handle a failed encrypted-package preparation with a **fresh** permit, not reuse a consumed permit.
4. Harbor needs an **actual authenticated receiver poller** configured with Harbor's X25519 decrypt key and pinned Fallen public Ed25519 signing identity. Harbor must validate the request's authority against Systemia's authenticated order context, not trust a string in the decrypted document; then return a signed receiver custody ACK and a **separate** private source-availability/rights response.
5. Before real customer files, require an end-to-end synthetic Courier exchange with Harbor and NextGen plus exact signed sender-status readback and separate Passport admission. The current owner-terminal evidence proves a protected Penguin broker, not this transaction.
6. Only after all gates and verified consent, Harbor may prepare/transmit 12 actual customer originals to Fallen. NextGen independently hashes them, and Fallen production/preview/checkout remain governed separately. No Meta Messenger send or payment is enabled here.

Do **not** copy customer footage through founder chats, public GitHub, or broad tailnet access. Leave Saban Microseed port :8791 alone; Courier is :8851.

Test: `node --test systemia/wing-courier/authorized-asset-demand-dispatch.test.mjs`

Tracking: #2280 first commercial, #2294 transport deployment, #2284 preview incident.
