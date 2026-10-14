# Evercraft OS detached witness source intake

**Status:** REVIEW HELD. This PR is a source-custody and CI intake, **not a production activation**.

## What is included

The immutable ZIP contains 37 additive `systemia/evercraft-os/*.mjs` source/test files, plus the earlier lifecycle documents, receipts and the originally recovered Passport proof dependency. The last isolated candidate passed **169/169 local tests** under an unprivileged Linux user. The ZIP is deliberately kept separate from active import paths at this stage.

- Archive SHA-256: `f5eaaf096dce8b12c0dd56198682b6953eca9cda505236eece5e519ceaf32aaa`
- ZIP Git blob SHA-1: `b03f98a9ccecc3b85e8a3c7974cc06e93ab9fab6`
- External source-custody receipt: `release:evercraft-os:external-witness:20261013:f5eaaf09` in Systemia, **blocked**
- GitHub canonical Passport source at intake: `10ca99a6fcb496828943b240b7e373f0a52ca875`, byte-matching the recovered proof dependency
- Historical local tests are NOT canonical CI, nor production health evidence.

## CI and merge gates

The workflow checks the archive hash, ZIP extraction, complete internal source inventory, exact Passport source compatibility and the local candidate tests. It separately exercises the existing canonical install ledger, runtime capsule and launcher tests. It has read-only GitHub permissions and does not deploy or issue any real authority.

Do not treat a passing workflow as permission to enable an application, run arbitrary binaries, restart a live service or admit Node002. It is intentionally an intake step.

## Next code-review slice

1. Rebase 37 additive sources into `systemia/evercraft-os/` on a separate reviewed integration commit; do not overwrite `systemia/passport/passport.mjs`.
2. Evaluate production key enrollment, monotonic independent witness custody and issuer-bound Passport permits against current canonical contracts.
3. Harden process confinement, immutable executable identity, operational incident recovery and real endpoint health.
4. Run broad repo CI, including Identity, Passport, NodeSeed, Execution Gate, Home and Yard, before any live switch.
5. Require explicit human review and a distinct production activation permit. Keep release held by default.

**Not implemented by this intake:** external witness service, proof of external commitment freshness, genuine production key custody, Linux sandboxing, canonical Home API integration, physical device deployment, general-purpose runtime execution, auto-recovery, revenue or payment routing.

## Security boundary

The archival package is public in this repository, so it MUST contain **no production signing keys or live credentials**. It was locally scanned for common secret-key patterns before import, but GitHub secret scanning and human review remain required. Synthetic signer keys and lab fixture are not production trust.
