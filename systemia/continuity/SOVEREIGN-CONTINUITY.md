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

## Offline HQ Direct Mode boot rehearsal (V2)

Once a private Source Vault has been created and verified on an Evercraft-owned machine, the operator can test a **disposable, detached** Evercraft Home boot from a freshly recovered copy. This never modifies live Home.

Run with local Node 22+ and Git; neither command fetches GitHub or calls ChatGPT:

    node systemia/continuity/source-vault.mjs verify --vault /secure/vault-outside-repo

    node systemia/continuity/offline-hq-drill.mjs --vault /secure/vault-outside-repo --receipt-dir /secure/owner-recovery-receipts

The drill:
1. Verifies/restores the private bundle into an independent temporary bare repository.
2. Checks out the exact source commit into an ephemeral worktree.
3. Starts recovered Evercraft Home on 127.0.0.1 on an ephemeral port in development-only Direct Mode.
4. Checks the health, overview and continuity status endpoints with NO upstream models, customer data, credentials, Passport or external provider services configured.
5. Closes the service, removes temporary files and optionally writes a private mode 0600 receipt into a mode 0700 directory.

A green receipt proves **committed source can be restored and Home can boot locally** on the tested machine. Its field network_interface_disconnected_by_drill:false says the tool does not itself disable the machine network. For a real air-gap field drill, independently disconnect external connectivity before running the command. Test this on NextGen as a genuinely separate device, not just the same Penguin checkout.

Never expose local development mode to a public interface. The tool forces loopback and is NOT a production Home deployment or authorization replacement. A standalone recovery proof does not recover the Identity, Passport, CRM, settlements, inbox, media archives or customers. Those still need private, encrypted backup with restore receipts.

Next gates: encrypted independent physical media, actual node-by-node receipts, signed offline release and rollback, production Identity/Passport recovery and full company Direct Mode operations while external AI and GitHub are unreachable. GitHub Actions only executes the tool's standalone regression tests; GitHub is not part of the tool's runtime.

## Encrypted portable recovery media (V3)

The existing Source Vault is private on disk but **not encrypted**. Before making a portable copy, the operator can now seal it using a local 256-bit key and authenticated AES-256-GCM with a fresh nonce for every copy. This uses Node's built-in crypto implementation, not GitHub or a cloud service. It has not had an independent external security audit.

Set up two **separate owner-controlled private 0700 directories**, one for the 0600 key file and one for the sealed recovery archive. Never keep the only key on the same portable drive as the archive. Use absolute paths throughout. Do not put the key contents in Git, issues, logs or chat.

    node systemia/continuity/sealed-transfer.mjs keygen --key-file /private/key-custody/recovery.key

    node systemia/continuity/sealed-transfer.mjs seal --vault /private/source-vault --output /private/media/evercraft-source.evsealed --key-file /private/key-custody/recovery.key

Copy the **encrypted** file to NextGen or separately controlled encrypted media, using approved local transfer. Independently provide the key through a secure channel. On NextGen, with this tool already available:

    node /offline/copy/sealed-transfer.mjs unseal --input /private/media/evercraft-source.evsealed --vault /private/recovered-source-vault --key-file /private/key-custody/recovery.key

    node /offline/copy/source-vault.mjs verify --vault /private/recovered-source-vault

    node /offline/copy/offline-hq-drill.mjs --vault /private/recovered-source-vault --receipt-dir /private/recovery-receipts

The unseal operation **does not overwrite** a prior vault. It decrypts into a new mode 0700 temporary vault, checks authenticated encryption before trusting metadata, validates the original source hash and performs an independent Git restore/fsck before moving the vault to the requested location. Invalid keys, modified ciphertext, unsafe permissions and existing destinations cause a hold.

**Scope of the receipt:** `encrypted_copy_created` only proves a local encrypted file was written. `encrypted_copy_restored_and_git_verified` proves local key-authenticated decryption and committed Git history restoration on the tested machine. Neither result proves the copied file reached NextGen, survived loss of Penguin, was transported on removable media, or restored customer data, Passport, private credentials or production HQ.

**Critical security and operating limits:** Historical secrets may live inside the underlying Git bundle. The unsealed vault is plaintext and should be held only temporarily on encrypted private disk with restricted access. Back up the recovery key separately: loss of the only key makes the sealed copy unrecoverable. The envelope uses AES-GCM confidentiality and integrity but is not a signed supply-chain release and is not an independent forensic attestation. No service may execute payments, publications or production deployments from an unseal event.

The next field gate is a real operator-controlled cross-device recovery on Penguin and NextGen, followed by separately encrypted private operational-state backups. This script never logs into either device, disables the network, performs a remote transfer or alters the production edge.
