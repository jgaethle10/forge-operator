# Penguin → NextGen: first real Sovereign HQ recovery drill

**State:** operator field procedure, NOT yet completed on real devices. No ChatGPT, GitHub, cloud or service account is needed *after* the committed recovery kit is already available locally. Run without sudo. No existing production service will be stopped or modified.

## Phase A: Penguin / Chromebook Linux terminal

Find an existing complete Evercraft Forge checkout. The previously used path is likely:

    REPO="$HOME/.local/share/evercraft/forge-operator"
    test -f "$REPO/systemia/continuity/device-field-kit.mjs" || echo "FIELD_KIT_NOT_INSTALLED"

If the tool isn't present, **hold**. Use a separately authorized source update while GitHub is still available, or a trusted local source copy. Do not download and execute an unknown Internet shell script or overwrite a dirty checkout.

The first safe command is read-only:

    node "$REPO/systemia/continuity/device-field-kit.mjs" preflight --repo "$REPO"

Expect JSON state `device_preflight_passed`. A dirty tracked checkout, shallow Git clone, incomplete refs or unavailable Node 22/Git must be repaired deliberately. No forced checkout, stashing, secrets, deleting files or emergency privilege changes.

Then prepare a local private archive, key, encrypted transfer file and portable tool set:

    STATE="$HOME/.local/state/evercraft/continuity-field"
    node "$REPO/systemia/continuity/device-field-kit.mjs" prepare --repo "$REPO" --state "$STATE"

Read the returned `sealed_file`, `encrypted_file_sha256`, `source_head` and `recovery_tool_sha256`. **The SHA-256 fingerprints are safe to share. Do not share key bytes, passwords or private Git content.** The tool stores private data outside the checkout:

- `$STATE/vault/`: **plaintext** private local Git archive, not for a USB/cloud copy;
- `$STATE/private-key/recovery.key`: **the recovery key**, never included in `transfer/`;
- `$STATE/transfer/<sealed_file>`: authenticated encrypted source copy;
- `$STATE/transfer/tools/`: local recovery tool copies;
- `$STATE/receipts/`: limited owner-only proof records.

The local archive covers committed Git history only. Nothing here backs up customers, Passport, Identity, payment records, publishing state or runtime databases.

## Phase B: transfer with key separation

Copy the **encrypted `.evsealed` file** and the tools (or a separately verified local tool distribution) to NextGen using an authorized device-to-device mechanism such as removable media. **Keep the recovery key on a separate protected medium or secure physical custody path.** Do not email it, paste it in ChatGPT, commit it, or place it alongside the encrypted file on the same removable drive.

Before executing portable JavaScript on NextGen, independently compare each copied tool's SHA-256 against the `recovery_tool_sha256` you recorded directly on Penguin, not against a manifest copied on the same potentially untrusted device:

    sha256sum /path/to/verified-tools/*.mjs

Use a trusted copy of Node 22 and Git already installed on NextGen. A raw USB filesystem may not enforce Unix mode 0600; copy the encrypted file, key and verified tools into their own **separate owner-private 0700 Linux/WSL directories**, setting files to 0600. Do not run this as root.

## Phase C: NextGen / HP Ubuntu WSL2 terminal

With the recovery tools already independently verified, set absolute local paths for the staged encrypted file and separately provided 0600 key. Use the exact `encrypted_file_sha256` printed by Penguin:

    node /path/to/verified-tools/device-field-kit.mjs recover \
      --sealed /home/coach/private-inbox/<sealed_file> \
      --key-file /home/coach/private-key/recovery.key \
      --expected-sha256 <64-char-ciphertext-SHA256-from-Penguin> \
      --state /home/coach/.local/state/evercraft/nextgen-recovery

The receiving command first compares the independently supplied encrypted-file fingerprint, authenticates AES-GCM using the separate key, restores all committed Git refs, executes Git fsck, and starts the recovered Home **loopback-only** in development Direct Mode to test health, overview and source continuity. It closes the temporary Home instance and leaves a private local recovery receipt. It never starts or upgrades a public service.

For a genuine offline test, disconnect the Internet on NextGen *before* the command once the encrypted file, key, Node, Git and tools are ready. The tool does not disable networking itself, so its receipt explicitly records that it **cannot prove** actual disconnection. Never disable the network on a device you're relying on for an ongoing remote support session.

The `nextgen_local_source_restored_and_home_booted` state is useful evidence of local code recovery and HQ process boot. It does not establish that the owner could log in using recovered Passport credentials, that customer data is available, that the USB copy is geographically independent, or that HQ could be deployed/rolled back without GitHub.

## Strict keep-open gates

The independent recovery challenge remains open until an actual Penguin source backup, encrypted transfer, NextGen independent physical boot and source SHA match are observed. Even then, business continuity stays open pending encrypted Identity/Passport and customer records, offline authorized build/install/rollback, and core non-AI HQ business operations.

**Never paste keys, raw customer records or unredacted logs into chat or GitHub.** Only share status codes, nonsecret SHA-256 hashes, a success/hold state and test receipt fields.
