# Drive Recovery Program

Status: active

Google Drive is the historical recovery source for Evercraft software artifacts created before GitHub became the canonical source system. Drive is not a replacement for version control and it is not an authority to overwrite newer code.

## Recovery path

1. Discover legacy software evidence in Drive.
2. Classify each artifact as source candidate, architecture/specification, operational data, commercial collateral, output artifact, or superseded material.
3. Map the artifact to the current Systemia capability/product and migration queue.
4. Keep Drive IDs, private URLs, credentials, customer data, personal data and internal topology out of the public repository.
5. Compare the historical artifact with current GitHub before restoring anything.
6. Recover only missing or demonstrably better material through a branch and reviewable commit.
7. Re-run tests, security checks, parity checks and release gates.
8. Do not retire the legacy runtime until the Base44 exit evidence contract is satisfied.

## Conflict rule

Newest is not automatically canonical and oldest is not automatically obsolete. When Drive and GitHub disagree, preserve both as evidence, identify the decision or behavior each represents, then reconcile intentionally. Never silently overwrite working current behavior from a historical artifact.

## Data rule

Spreadsheets, intake responses, customer records and operational ledgers are data sources. They must not be copied wholesale into source control. Recover schemas, adapters, fixtures and migration logic without publishing private rows.

## Superseded material

Files whose names or contents indicate that they are superseded, send-candidate-only, draft, or historical remain quarantined until a current contract explicitly selects them.

The sanitized inventory in `inventory.json` proves that a recovery source exists without exposing the private locator for that source.
