# Evercraft OS install ledger

An app contract is not an installation.

The install ledger defines the first mutation boundary for Evercraft OS applications. It records installation state only after a subject presents a valid, single-use Passport action permit issued under the **Evercraft OS** authority domain.

## Separate authority domains

An application's own permissions cannot authorize installation.

For example:

- `rivet / report.generate` may authorize a bounded AliEV report action.
- it does not authorize `evercraft-os / app.install`.
- installation requires a separate OS-level grant and action permit.
- uninstall requires a separate `evercraft-os / app.uninstall` permit.

This prevents application capability from expanding into operating-system authority.

## Request binding

Install and uninstall permits are bound to the exact request fingerprint.

The install fingerprint covers:

- product key
- subject
- target NodeSeed node ID
- OS app resource reference
- package fingerprint
- contract version

Changing the package or target machine changes the fingerprint and invalidates the permit.

## Package integrity

A contract-ready app descriptor is canonicalized and SHA-256 fingerprinted before installation state may be recorded.

The ledger does not claim code signing, executable materialization, sandboxing, or runtime launch yet. Those belong to later package-distribution slices.

## Append-only state

Install and uninstall operations append receipt-backed events. Current state is derived from the event stream.

Uninstall preserves a rollback pointer to the prior install event and package fingerprint. This is provenance for future package restoration, not a claim that binary rollback has already occurred.

## Truth boundaries

A recorded install event currently means:

- the OS package contract was contract-ready;
- the exact request was authorized by a single-use Passport permit;
- the package descriptor fingerprint matched;
- the install state transition was written to the append-only ledger.

It does **not** yet mean:

- executable bytes were copied;
- a runtime was launched;
- a system service was enabled;
- a container/image was materialized;
- device capabilities were granted.

Those claims remain false until the corresponding runtime slices exist.
