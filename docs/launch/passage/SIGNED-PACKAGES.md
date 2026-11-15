# Evercraft Passage: signed plain-text package v1 (demonstration only)

**Status:** draft engineering feature in PR #1763. Not security-certified; no publisher has been independently identity-verified and no public distribution is authorized.

## Purpose and limitations

A publisher with an Ed25519 private key can sign one original Passage demonstration guide. A recipient who already knows and trusts the corresponding public key can verify the package offline before saving the original text. The package itself **never carries a trusted public key**. A signed file is not proof that the contents are factually correct, current, licensed for redistribution, or safe to possess.

- No server, account, uploads or remote API is needed to verify a downloaded file.
- This is not encryption, steganography, censorship circumvention, anonymity or automatic P2P delivery.
- Each signed item is bounded, UTF-8 plain text with a SHA-256 digest, edition date, short expiry (maximum 30 days) and original rights notice.
- No third-party copyrighted information is ingested; only original demonstration guides in the local catalog may be signed by the CLI.
- Browsers that do not support WebCrypto Ed25519 fail closed. The Node 22 CLI verifier is an alternative.
- A trusted key and its expected fingerprint must be obtained through a separately authenticated publisher channel; the browser and CLI now both require the expected SHA-256 fingerprint before releasing verified text. A key delivered with the package is insufficient evidence of identity.
- No revocation mechanism exists offline; trusted keys may later be compromised or withdrawn, and previously saved plain text cannot be recalled. Recipient device clocks must be reliable.
- The phrase "SIGNATURE AND CONTENT VALID" refers only to a cryptographic check against the supplied trust anchor, not the publisher's actual identity or journalistic reliability.

## Local lab procedure (Node 22+, OpenSSL; DO NOT publish this demo key)

Run from the root of a local checkout:

    export PASSAGE_LAB="$(mktemp -d)"
    chmod 700 "$PASSAGE_LAB"
    openssl genpkey -algorithm Ed25519 -out "$PASSAGE_LAB/editor-private.pem"
    chmod 600 "$PASSAGE_LAB/editor-private.pem"
    openssl pkey -in "$PASSAGE_LAB/editor-private.pem" -pubout -out "$PASSAGE_LAB/editor-public.pem"

Issue one package from the original demo catalog:

    node scripts/passage-signed-package.mjs issue --article=check-a-claim --key="$PASSAGE_LAB/editor-private.pem" --out="$PASSAGE_LAB/demo-package.json" --ttl-days=7

On a receiving device with a **separately trusted** public key and expected fingerprint, verify. In this local demonstration only, derive the expected fingerprint for comparison, but actual production verification must obtain the trusted fingerprint independently:

    export PASSAGE_EXPECTED_FINGERPRINT="$(openssl pkey -pubin -in "$PASSAGE_LAB/editor-public.pem" -outform DER | openssl dgst -sha256 | awk '{print $NF}')"
    node scripts/passage-signed-package.mjs verify --file="$PASSAGE_LAB/demo-package.json" --trusted-key="$PASSAGE_LAB/editor-public.pem" --expected-fingerprint="$PASSAGE_EXPECTED_FINGERPRINT" --out="$PASSAGE_LAB/verified-guide.txt"

The temporary folder intentionally sits **outside the repository** to reduce the risk of accidentally committing a private key. Never share the private key; delete demo private keys after testing. Keys remain out of the web build and all CI artifacts. The web UI's "Verify a carried file" area accepts the package JSON and public PEM and checks them locally. It only reveals the save button after signature, content digest, expiry, type, size and an independently supplied key fingerprint match.

## Signed envelope contract

- Top-level: format, signed_data, signature_base64, content_base64 (exactly these).
- Signed data: format, publisher (unverified claim), article_id, title, edition, issued_at, expires_at, content_type, filename, byte_length, sha256, rights, review_state (exact fields).
- Signature: 64-byte Ed25519 signature of UTF-8 bytes of JSON.stringify(signed_data), encoded as canonical base64. For v1, property order is part of the protocol. A future version must define independent canonicalization and cross-language interoperability rules.
- Content: canonical base64 of unencrypted UTF-8 plain text, never executable markup.
- Signer never includes a public key in the envelope. Recipient supplies a separately trusted SPKI PEM. Its SHA-256 DER fingerprint is displayed for comparison.
- Current thresholds: maximum plain text 750,000 bytes, entire JSON package 1,500,000 bytes, maximum validity 30 days. More than five minutes into the future or past its expiry is rejected.
- Reject unknown fields, invalid lengths, altered rights, expired items, incorrect content hashes, invalid signatures and wrong trusted keys.
- This package proves integrity only for v1. It has no replay sequence, encrypted destination binding, identity enrollment, trust revocation, transport adapter or high-risk publishing approval.

## QA gates

    node --test tests/passage-package.test.mjs
    node --test tests/passage-browser.test.mjs

The browser test additionally verifies a package in a real Chrome engine using a generated ephemeral key, rejects a tampered package and checks that unverified files cannot be saved. Screenshots and mobile emulation do not substitute for native iOS and Android tests.

No public deployment or safety claims until an independent cryptographic review, editor-key ownership policy, jurisdictional considerations, physical-device offline validation, authorized distribution rights, incident response and correction process are established.

## Two-device simulated handoff acceptance (v0.3 lab)

The browser acceptance test uses **two isolated Chrome browser contexts** (publisher and recipient) with separate storage and service workers. The recipient preloads the offline app shell, disconnects from the network, and then receives original demonstration material through a simulated file carriage event (a local file picker). A separately supplied public key and independent expected fingerprint are required before saving verified text. A wrong fingerprint must fail and disable export.

This is a **simulation, not a test involving two physical devices**. It proves neither key distribution authenticity nor secure transport, resistance to censorship, protection from inspection, or physical device isolation. Both contexts run on the CI host. No private key is sent to the receiving context.

### Physical operator checklist (not yet completed)

1. Use original demo content, non-sensitive devices, and an authorized person at each device.
2. Preload Passage on the recipient's browser, then disconnect both Wi-Fi and cellular networking. Check that the cached reading room and verification screen still open.
3. Independently authenticate the publisher's Ed25519 public-key SHA-256 fingerprint through a trusted channel established **before** receiving the package. Never trust the file or a companion note to certify its own publisher key.
4. Hand-carry the signed JSON file by an ordinary user-approved file-transfer method. Supply the public key. Automatic discovery, LAN hosting, radio, proxies, stealth delivery or device pairing are not implemented.
5. Enter the independently obtained fingerprint, verify while offline, save the plain-text demo article, and check its contents.
6. Alter the content, swap the key, enter a different fingerprint, and test expiry. Each should be rejected without releasing verified text.
7. Retain only technical receipt fields such as browser version, test case and observed result, not identities or document contents.
8. Repeat on actual iOS Safari and Android Chrome. Document browser support, local file exposure, and offline persistence after a restart.

**No-go for high-risk distribution** until independent safety, legal, editorial, and key-governance reviews are complete.

## v0.4 truly standalone verifier and portable handoff kit

Build with `PASSAGE_KIT_DIR=/path/to/empty/output node scripts/build-passage-device-kit.mjs` (output directory should be OUTSIDE the repository). CI also builds the device-lab artifact. The kit contains:

- `passage-offline-verifier.html`: a single HTML file embedding the existing Passage Ed25519 verifier and file-picker UI with no external assets. A restrictive CSP pins the exact inline script and stylesheet hashes. No network calls, accounts or uploads are made by the verifier.
- `DEMO-package.json`: the original demonstration text, signed with an ephemeral Ed25519 private key created in memory and never saved.
- `DEMO-public-key.pem` and `DEMO-fingerprint-UNTRUSTED.txt`: test-only matching public key and fingerprint. **Both come from the same untrusted bundle as the package. They cannot establish independent publisher identity.**
- `SHA256SUMS.txt`: detects changes to the files only if the checksum itself is obtained from a trusted source. It is **not** an authenticated signature or evidence of trustworthy authorship.
- `READ-ME-FIRST.txt`: offline test guidance and risks.

Chrome CI directly opens the built HTML using `file://`, turns browser networking off, checks WebCrypto availability, verifies the demo using local file inputs, downloads plain text, and rejects a mismatched fingerprint. A browser that disallows secure-context WebCrypto on local files must **fail closed**; never silently disable signature checks. A passing Chrome file-open test is **not** proof of native iOS Safari file handling or physical device security.

Use the included key/fingerprint together only to demonstrate signature mechanics, never to claim independent trust. Public or high-risk distribution still requires separately provisioned and authenticated issuer keys, a verified delivery chain for the verifier, rights clearance, revocation/correction governance, and physical-device tests.

## v0.5 local physical-device evidence path and WebKit engine checks

The portable HTML verifier includes a **Run local compatibility check** action. It tests a SHA-256 known-answer vector, an RFC 8032 Ed25519 verification vector, and a deliberately altered message that must be rejected. No server, analytics, network request, document text, publisher key, IP address, account, device ID, user-agent string or location is collected. A separate **Save local test receipt** button creates a small JSON file on the device only. The user may manually mark whether they disabled Wi-Fi and cellular, but this is self-reported and **not** a measurement of network isolation. The receipt includes only test results, a broad optional device category, a test timestamp, and whether the package verifier's UI showed success/failure. The signing key and package contents are never included.

In CI, `tests/passage-device-qa.test.mjs` validates the crypto vectors and minimal receipt schema, and a separate macOS job runs `tests/passage-webkit.test.mjs` with Playwright WebKit. A green WebKit run validates a Safari-like browser **engine**, not native Safari on a real iPhone or iPad. Unsupported `file://` WebCrypto fails closed, requiring an explicit alternative supported browser, not bypassing the signature.

**Operator procedure:** download the GitHub device-lab ZIP, extract it using the phone's ordinary Files interface, open `passage-offline-verifier.html` in the chosen browser if the platform supports local HTML execution, then disable internet access and run the self-check with synthetic demo files only. If the file preview blocks scripts or local WebCrypto, mark the device UNSUPPORTED and stop; do not alter security settings or promise a workaround. Save the optional local receipt only if the user consents to sharing it. Genuine device testing remains unperformed until observed on physical hardware. 

## WebKit engine compatibility blocker (observed 2026-11-09, not a physical device test)

macOS Playwright WebKit 26.0 on GitHub Actions rejected the valid RFC 8032 Ed25519 signature in the self-check (returned `false`, while Node and Chromium passed). It also produced an internal navigation error on an offline `file://` reload. We **do not support or approve WebKit/Safari for signed Passage verification** based on these results. The macOS test exercises a safe fallback from a loopback-served copy while offline and must verify that the same valid signed demo is rejected without offering verified-text download. **A green WebKit CI job here means safe rejection, not verified signature compatibility or working standalone-file delivery.** If a future WebKit build passes both known-answer and signed content tests, the test follows its success branch.

Do not drop the signature test, accept unverified content, skip the independently trusted fingerprint, or claim an iPhone is validated. Real iOS browser/container support must be separately demonstrated. Review the official WebKit Ed25519 implementation and applicable platform fixes before revisiting this gate.
