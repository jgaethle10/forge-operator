# Wing Courier | first real owner-side enrollment plan
November 19, 2026 Pacific

Status: source and test artifact only. No live broker, resident, Fabric route, sender credential delivery, or customer preview is claimed.

This change closes a missing *private broker configuration preparation* step for the Harbor <-> Fallen Courier. It does NOT by itself close the actual encrypted transfer.

## Confirmed technical boundary

- Loopback Courier broker is reserved for 127.0.0.1:8851 on Penguin. The 8791 port is Saban Microseed Gateway, not Courier, and must not be touched.
- Latest direct Penguin evidence found 8851 unoccupied and locally running Fabric on 8787, but neither a live Courier broker nor the public HTTPS private path was proved.
- Penguin has locally modified Journal source files. Its old Fabric update script may destructively restore/clean Journal paths. Protect and verify a private Journal backup before any Fabric update.
- Harbor has privately packaged twelve customer assets and local signing keys, but NextGen has not returned a genuine receiver-owned 12/12 custody receipt, and the original preview incident remains frozen.
- The private X25519 Fallen *decryption* public key and Ed25519 *signature* public key have different functions. Broker ACK keys alone cannot encrypt a Harbor -> Fallen package.

## New owner-local tool

systemia/wing-courier/prepare-broker-enrollment.mjs

DRY_RUN is default, without any file writes or network access. Inputs: an existing owner-only parent folder, a new intended broker root, independently verified Harbor and Fallen Ed25519 ACK-signing PUBLIC key PEM files, and their actual independently confirmed 64-hex SHA256 SPKI fingerprints. Public signer identities must be different. Never derive trusted fingerprint values solely from untrusted messages.

Example dry run, to be adjusted by the authorized Penguin operator using actual approved private paths:

    node systemia/wing-courier/prepare-broker-enrollment.mjs \
      --root /actual/owner-private-parent/wing-courier-broker \
      --harbor-sign-pub /actual/trusted/harbor.sign.pub \
      --harbor-fingerprint ACTUAL_64_HEX_FINGERPRINT \
      --fallen-sign-pub /actual/trusted/fallen.sign.pub \
      --fallen-fingerprint ACTUAL_64_HEX_FINGERPRINT

After independent review, exact owner identity confirmation, and local authorization, the same command may append:

    --provision --confirm-owned-host

The provision mode atomically creates a new owner-only private root containing broker.json, state/, secrets/ and trusted/ at 0700/0600. It generates exactly four distinct cryptographically random private bearer tokens (one send/receive token per wing), pins verified public signer keys, fixes the broker loopback port at 8851 and scopes wings to harbor <-> fallen. The existing broker installer dry-run validator is invoked after provisioning. Reusing an existing destination is denied.

The tool NEVER starts systemd, updates Fabric, opens a public route, sends or exposes a bearer token, enrolls private decryption keys, transfers customer media, requests payment or grants production/send authority. Only public signer fingerprints and aggregate nonsecret results may be printed.

## The four remaining live acceptance gates

1. Broker: an authorized owner-machine operator inspects private broker config, systemd identity and free 8851; then separately runs the existing install-broker.mjs dry-run and approved opt-in activation. Verify the exact Wing Broker /health contract and 403 unauthenticated send and receive on 8851. Preserve Saban and Journal.
2. Trusted identities: use a genuine independently authenticated owner-controlled private secret channel to deliver Harbor role-scoped tokens to Harbor and Fallen role-scoped tokens to NextGen, enroll Harbor public Ed25519 signer on NextGen, and deliver verified Fallen public X25519 decryption key to Harbor. Never send credentials via GitHub, PR comments, ChatGPT, customer email, public URLs, or untrusted DMs. If private secret distribution is unavailable, report CREDENTIAL_DISTRIBUTION_HELD.
3. Owned Fabric and resident: only after preserving dirty Penguin Journal files, explicitly opt-in the narrow existing Fabric HTTPS Courier route and verify real anonymous 401/403 and authenticated receiver inbox 200 with NextGen receiver-auth-canary.mjs, plus correct resident user-service identity, role config and outbound-only polling. A 401 from Saban 8791 is irrelevant.
4. Synthetic and customer transfer: obtain a signed receiver-ACK and exact source SHA receipt from an actual synthetic cross-device transport. Only then send the real consented customer twelve-file encrypted package from Harbor, independently rehash 12/12 originals on NextGen, admit a separate authorized Systemia/Passport job and assign a real Fallen producer. First-recovery preview requires independent audio/visual QC and exact-file founder approval; client approval precedes payment; provider-verified settlement precedes final master delivery. Incident #2284 remains held.

## Verification

Tests: node --test systemia/wing-courier/prepare-broker-enrollment.test.mjs
Full Courier contract CI: node --test systemia/wing-courier/*.test.mjs

Tracking: https://github.com/jgaethle10/forge-operator/issues/2294
Customer work: https://github.com/jgaethle10/forge-operator/issues/2280
Preview bypass incident: https://github.com/jgaethle10/forge-operator/issues/2284

Neither source CI nor a newly created config proves the real courier operates on Penguin, NextGen or Harbor. Field proof must come from the actual approved owned machines, and secrets/customer files remain private.
