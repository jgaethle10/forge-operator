# Evercraft Passage: signed plain-text package v1 (demonstration only)

**Status:** draft engineering feature in PR #1763. Not security-certified; no publisher has been independently identity-verified and no public distribution is authorized.

## Purpose and limitations

A publisher with an Ed25519 private key can sign one original Passage demonstration guide. A recipient who already knows and trusts the corresponding public key can verify the package offline before saving the original text. The package itself **never carries a trusted public key**. A signed file is not proof that the contents are factually correct, current, licensed for redistribution, or safe to possess.

- No server, account, uploads or remote API is needed to verify a downloaded file.
- This is not encryption, steganography, censorship circumvention, anonymity or automatic P2P delivery.
- Each signed item is bounded, UTF-8 plain text with a SHA-256 digest, edition date, short expiry (maximum 30 days) and original rights notice.
- No third-party copyrighted information is ingested; only original demonstration guides in the local catalog may be signed by the CLI.
- Browsers that do not support WebCrypto Ed25519 fail closed. The Node 22 CLI verifier is an alternative.
- A trusted key must be obtained **separately**, e.g., securely exchanged and fingerprint-checked with a known publishing organization. A key delivered with the package is insufficient evidence of identity.
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

On a receiving device with the package and **separately trusted** public key, verify:

    node scripts/passage-signed-package.mjs verify --file="$PASSAGE_LAB/demo-package.json" --trusted-key="$PASSAGE_LAB/editor-public.pem" --out="$PASSAGE_LAB/verified-guide.txt"

The temporary folder intentionally sits **outside the repository** to reduce the risk of accidentally committing a private key. Never share the private key; delete demo private keys after testing. Keys remain out of the web build and all CI artifacts. The web UI's "Verify a carried file" area accepts the package JSON and public PEM and checks them locally. It only reveals the save button after signature, content digest, expiry, type and size checks succeed.

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
