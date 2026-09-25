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

## Seven-artifact contract canary

`fixtures/aliev-rivet-sites-1-7.json` is a sanitized seven-artifact contract canary that mirrors the production Sites 1-7 transport shape without publishing live artifact ids, hashes, app ids, addresses or private topology. Live production verification belongs in destination receipts, not in the repository.

Run:

```bash
npm run proof:beast-mode
npm run saban:multiply -- --software beast-mode --inventory systemia/beast-mode/fixtures/aliev-rivet-sites-1-7.json --auto
```

## Public/private boundary

BEAST MODE is infrastructure, not a public discovery product. Do not publish internal topology, credentials, customer data or unrestricted transfer endpoints through CHUM. Public products may advertise that verified artifact delivery exists, but invocation remains behind product-specific authorization and payment/entitlement gates.

## Football cargo object

Canonical football protocol: `evercraft.beast-mode.football.v1`.

A football is the sealed binary form of one admitted BEAST MODE cargo manifest plus its immutable artifact bytes. The football is transport-neutral and is intended to cross authorized storage, API, queue, filesystem, or object-transfer adapters without changing the underlying work products.

The lifecycle is:

`ARTIFACTS -> PACK -> FOOTBALL -> TRANSPORT -> CATCH -> VERIFY -> UNPACK -> ORIGINAL ARTIFACTS -> RECEIPT`

The football header binds the cargo id, canonical manifest hash, whole payload hash, compressed payload hash, artifact offsets, byte counts and per-artifact SHA-256 values. The payload is compressed for transport. Opening a football reconstructs the original artifact bytes and re-verifies them against the admitted manifest before they are exposed to the destination adapter.

Large footballs may be split into `evercraft.beast-mode.football-part.v1` parts. Every part carries the whole-football hash, its own hash, sequence number and total count. Parts may arrive out of order, but the receiver must validate the complete set and whole-football hash before opening the cargo.

The native `.football` object is the canonical carrier. Do not hide cargo inside image pixels or rely on lossy image pipelines. If an interface requires a PNG, use a visible preview or receipt that references the football by content hash while the football itself travels through an authorized BEAST MODE transport adapter.

Run the football proof:

```bash
npm run proof:beast-football
```

A delivery is still not complete merely because a football arrived. BEAST MODE only reaches `DELIVERED` after the unpacked destination artifacts satisfy the normal destination verification and receipt contract.
