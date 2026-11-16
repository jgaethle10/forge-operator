# Evercraft Sovereign Continuity | Source custody and independent restore

**Release boundary:** V1 is a source-code rescue path. It is not yet a full company continuity certificate, production backup schedule, customer-data restore, independent deployment pipeline, or verified offsite backup.

**Rule:** Evercraft can use GitHub as a remote mirror, never as the last recoverable copy of source. ChatGPT and hosted AI must not be required to recover it. Evercraft Lineage remains the richer native provenance model. Git bundles are an interoperable rescue format.

## Available local tool

File: systemia/continuity/source-vault.mjs

Uses Node 22+, the locally installed Git executable, and local files. No HTTP, SSH, GitHub client, SaaS API, external model, or network is required at execution time.

- Requires an existing full non-shallow repository with valid committed Git refs.
- Holds if tracked worktree changes are uncommitted, so no one believes a bundle includes unstaged work.
- Backs up complete local Git refs and committed history as a private mode 0600 Git bundle in a mode 0700 directory OUTSIDE the source checkout.
- Stores a private immutable manifest and SHA-256 bundle digest, and updates a latest pointer.
- Re-verifies local bytes, independently clones the bundle to an ephemeral bare repository, checks Git object integrity, and compares exact branch/tag ref digests.
- Restores an independent bare Git repository to a new, empty destination without overwriting the old worktree.

## Operator commands on Penguin, NextGen, or another owned Linux machine

Before any outage, from a known-good complete repository:

    git status --short
    git rev-parse --is-shallow-repository     # must say false
    node systemia/continuity/source-vault.mjs backup --repo /path/to/forge-operator --vault /secure/vault-outside-repo
    node systemia/continuity/source-vault.mjs verify --vault /secure/vault-outside-repo

When GitHub is unreachable, with a copy of the tool already present:

    node /offline/copy/source-vault.mjs restore --vault /secure/vault-outside-repo --destination /recovered/repo.git
    git --git-dir=/recovered/repo.git fsck --full
    git clone /recovered/repo.git /recovered/worktree

The verify command itself proves an independent local restore in disposable storage. No GitHub login or cloud AI is needed.

**Critical:** to survive hardware loss, the tool, Node, Git, runbook and backup must also be available on a separate trusted recovery device or encrypted offline media. A vault stored only on Penguin does not protect against Penguin loss.

## Boundaries that must never be hidden

- Git bundle captures committed Git refs, NOT uncommitted tracked edits, untracked files, databases, credentials, Identity and Passport state, CRM records, payment records, Journal private files, Clip posts, customer deliveries, private media or off-repo secrets. These require separate consistent backups.
- Git history may itself contain historical secrets. This V1 **does not encrypt bundles at rest**. Do not upload bundles or manifests to a public service. For any external/offsite copy, use owner-managed encrypted media and recoverable keys.
- SHA-256 detects corruption against the local manifest, not malicious replacement when an attacker controls both bundle and manifest. Signed, independent receipts and cross-device custody remain needed.
- A local source restore does not prove production DNS, private HQ, payment processing, publishing, customer work or independent code deployment.
- Offline mode never increases Passport authority. Backup/restore must not publish, charge customers, execute missions, or contact providers.
- Two machines in one location may share fire/power/theft risks. Geographic and power-domain diversity is a future requirement.

## Company independence acceptance targets (not achieved by V1)

1. Repeated offline source backup and independent restore on real owned machines.
2. Native Evercraft Lineage replication on independent devices with signed integrity and recoverable keys.
3. Owned build, install, test and rollback of exact release artifacts with **GitHub Actions disconnected**.
4. Encrypted and consistent backups for Identity, Passport, customer data, orders, invoices, Journal, Clip, product and media records, with safe reconciliation and non-replay of irreversible operations.
5. HQ Direct Mode can perform each essential business action through normal controls without ChatGPT, cloud models or a GitHub session.
6. Simulated GitHub outage, AI outage, device loss and network outage with real restore receipts, documented recovery times and recovery points.

This tool establishes the first bounded rescue capability and a reproducible synthetic proof. Do not call the company fully independent until the separate acceptance criteria are proven.
