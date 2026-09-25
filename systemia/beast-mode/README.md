# BEAST MODE

BEAST MODE is Systemia's internal artifact logistics layer.

It moves immutable, provenance-bearing work products between Evercraft products and authorized customer destinations without forcing every product to invent its own transfer protocol.

The first production lane is AliEV -> BEAST MODE -> RIVET for EV site-plan artifacts and report packages.

## Contract

Canonical protocol: `evercraft.beast-mode.cargo.v1`.

Cargo states:

`ADMITTED -> PACKING -> IN_TRANSIT -> RECEIVED -> VERIFIED -> DELIVERED`

Any non-terminal state may fail closed into `QUARANTINED`. A quarantined cargo may only return to `PACKING` after the failure is documented and a new attempt is admitted.

`DELIVERED` is not an HTTP 200. It requires all of the following:

1. destination object exists;
2. destination bytes match the source SHA-256;
3. destination byte count matches;
4. required provenance and evidence metadata are present;
5. destination permissions match the manifest;
6. customer delivery authority is explicit when the recipient is external;
7. a delivery receipt is written.

## Systemia and Saban

Systemia owns admission, deduplication, dependency checks, priority, authority and receipt lineage.

Saban may fan out bounded logical workers for checksum verification, chunk transfer, destination verification, provenance checks, retries and reconciliation. Logical agents do not create new authority. They inherit only the bounded cargo capability already admitted by Systemia.

BEAST MODE is deliberately transport-neutral. Source and destination adapters are responsible for authenticated reads/writes. The core never stores plaintext credentials or treats checkout creation as payment proof.

## Current first-seven canary

`fixtures/aliev-rivet-sites-1-7.json` records the seven AliEV site-plan artifacts currently present in the RIVET internal workspace. The fixture is a verification canary, not authorization for external customer delivery.

Run:

```bash
npm run proof:beast-mode
npm run saban:multiply -- --software beast-mode --inventory systemia/beast-mode/fixtures/aliev-rivet-sites-1-7.json --auto
```

## Public/private boundary

BEAST MODE is infrastructure, not a public discovery product. Do not publish internal topology, credentials, customer data or unrestricted transfer endpoints through CHUM. Public products may advertise that verified artifact delivery exists, but invocation remains behind product-specific authorization and payment/entitlement gates.
