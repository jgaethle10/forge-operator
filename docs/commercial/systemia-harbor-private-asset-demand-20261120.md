# Systemia → Harbor → Fallen | first original-asset demand

**Status:** owner-private **source contract**, not a live dispatched mission. This is a safe first step toward an automatic asset-request loop. The customer recovery remains frozen under #2284. Do not place client identities, personal messages, original filenames, footage, private manifests, tokens or keys in GitHub issues.

## What is actually implemented

`systemia/wing-courier/private-asset-demand.mjs` creates a strictly scoped, opaque asset-demand candidate from a local Systemia operator to Harbor for delivery to Fallen. A verified local owner operator may store it inside an **already created 0700, same-user-owned private directory**. Each record is 0600, exclusive-create, idempotent on identical retries and conflicts on a reused ID with different scope. Symlinked paths, extra authority fields and requests for customer contact, production or payment are rejected. It contains no customer source bytes or customer identifiers.

The first pending candidate's **planning** scope is:
- opaque `caseRef: commercial-recovery-pilot` (replace with the real approved private order reference at local staging time);
- origin `systemia-private-candidate`, `harbor` sender, `fallen` recipient;
- `expectedAssetCount: 12`, `assetKind: media`, `intent: ORIGINAL_ASSET_CUSTODY_ONLY`;
- `state: PENDING_AUTHENTICATED_HARBOR_PICKUP`.
- `customerContactAuthorized: false`, `productionAuthorized: false`, `paymentAuthorized: false`.

**Creating or staging this record DOES NOT send it to Harbor.** GitHub writes are source changes, not Systemia Intake Fabric admission. Neither the public PR nor the request's `requestedBy` field authenticates Systemia, Harbor or customer rights.

## Owner-private integration example (NOT a remote command)

```js
import {draftPrivateAssetDemand,stagePrivateAssetDemand}
  from './systemia/wing-courier/private-asset-demand.mjs';
const request=draftPrivateAssetDemand({
  caseRef:'commercial-recovery-pilot',
  expectedAssetCount:12,
});
const candidateReceipt=stagePrivateAssetDemand({
  request,
  privateQueueDir:'/approved/owned/private/systemia/asset-demands',
});
```

The actual private queue must already exist and be approved on the real owner machine, not created in chat/GitHub. This is an inert candidate. The future authenticated **owner-private bridge** must:
1. Admit a bounded request using actual Systemia Passport actor/mission authority, not the draft text.
2. Deliver a scoped request to Harbor's actual authenticated outbound agent; Harbor independently verifies customer consent/rights and the original local 12-file manifest. No direct vendor network enrollment or founder file copying.
3. Check a completed authenticated synthetic Harbor → protected Fabric → Penguin broker :8851 → NextGen receiver transfer, receiver-signed ACK and Harbor status readback **before** requesting real customer bytes. A public anonymous 401 is not an authenticated transfer.
4. Pin a genuine Fallen X25519 recipient public key and Harbor Ed25519 signer, and distribute only role-scoped credentials through an authenticated owner-private channel. No secrets or customer media in GitHub or chats.
5. On authorized Harbor owner-local execution, use the existing `client.mjs prepare` and `push` methods with the customer's consented originals, then confirm the **real** NextGen 12/12 independently rehashed receipt. Route the verified receipt through the existing Passport-gated `intake-bridge.mjs`.
6. Assign a named Fallen producer separately for rights-cleared creative work, independent audio/picture QC, and an owner-approved exact preview before any Harbor/Meta customer send. The source guard is not yet proven on the live native Messenger sender. Keep #2284 frozen.

## Evidence requirements

The source contract deliberately reports `harborReceived:false`, `systemiaAdmitted:false`, `transportStarted:false`, and `customerReleaseAuthorized:false` on a local staging receipt.

A successful source test or GitHub merge does not prove the original 12 files reached NextGen. Only actual signed operator receipts and approved private-machine/network observations may change that conclusion.

Tests: `node --test systemia/wing-courier/private-asset-demand.test.mjs`.

Tracking: #2280 customer work; #2294 real Courier deployment and scoped token distribution; #2284 customer-preview incident and frozen delivery.
