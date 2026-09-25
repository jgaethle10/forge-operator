# Evercraft Transport Diversity v1

Evercraft Network must not confuse a transport with the network itself.

The **network contract** is identity, trusted peer discovery, capability/capacity description, authenticated envelopes, checkpointing, store-and-forward, receipts, and reconciliation.

A transport is merely one way those objects move.

## Current transport states

### Verified software paths

**LAN HTTP data**

The existing NodeSeed / local-organism stack already executes over ordinary local IP endpoints without requiring a named cloud provider.

**UDP multicast discovery**

The existing Evercraft capacity beacon can advertise credential-free local NodeSeed endpoints with expiry. This is a discovery lane, not a data plane and not authorization.

**File courier**

The file courier can place an authenticated Evercraft secure envelope onto a local directory or mounted removable-media path using content-addressed filenames and atomic writes. A disconnected receiver can import the file later.

The courier verifies the file content hash before handing the envelope to the authenticated-envelope layer. The envelope layer still owns destination binding, expiry, cryptographic authentication, and replay protection.

### Planned, not yet verified

- Wi-Fi Direct
- BLE discovery / fragmented store-and-forward
- authorized radio gateway adapters

The transport router is forbidden from selecting these merely because they appear in the catalog.

## Routing rule

A route must satisfy all of the following before Saban may select it:

- evidence state is verified;
- it supports the required purpose;
- it can operate in the current offline requirement;
- payload size fits;
- latency class fits.

If every verified path is gone, the correct answer is **NO_ROUTE**.

That is preferable to pretending a planned BLE or radio capability exists.

## Courier semantics

The courier path is intentionally boring. That is a feature.

When every radio route fails, a person, vehicle, drone, or other legitimate physical courier can carry removable storage from one isolated Evercraft island to another. The bytes do not gain authority merely because they crossed an air gap.

The recipient still:

1. verifies courier-file integrity;
2. authenticates and decrypts the envelope;
3. verifies destination;
4. checks expiry;
5. checks replay state;
6. runs partition-reconciliation rules before executing delayed work.

## Evidence boundary

The automated proof establishes the carrier-neutral routing semantics and a real filesystem courier implementation. It does not claim that USB hardware, SD cards, Wi-Fi Direct, BLE, or radio links have been field tested between separate devices yet.
