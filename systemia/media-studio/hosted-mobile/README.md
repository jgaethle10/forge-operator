# Fallen Studio Mobile Director: release verification bridge

This **public-safe, read-only** bridge verifies the hosted Fallen RC 1.0.2 staging editor without copying its proprietary renderer into the public `forge-operator` repository. The future private source-of-truth repository must be connected separately through Systemia, Lineage and Yard, with authorization and exact artifact digests. This bridge does not grant deployment authority.

The staged HTTPS URL is publicly reachable, not a private workspace. **Do not upload client projects, unpublished media, secrets or sensitive files.**

## First-party verification

- `node scripts/fallen-mobile-canary/check-source.mjs`: signed-out HTTPS fetch, strict source SHA-256, title and mobile controls, after removing precisely one known host-injected 192-byte script.
- `node scripts/fallen-mobile-canary/check-browser.mjs`: mobile-sized Chromium and WebKit tests with open-source Playwright, running under Evercraft's own execution or GitHub Actions.
- `.github/workflows/fallen-rc102-hosted-staging-canary.yml`: read-only CI triggered by targeted pull requests or explicit workflow dispatch. No automatic publication, payment, deployment or production Browser Fabric activation.

Manifest: [rc102.staging.json](./rc102.staging.json)

## Release boundary

These are **staging** tests, not production approval. They do not prove physical iPhone Safari acceptance, secure private access, full content quality, actual construction physics, or Evercraft-owned hosting cutover.

Systemia release: `fallen-rc102-mobile-director-20261014:v1`. Status: **BLOCKED** pending physical device acceptance and access review.

When the hosted URL or source changes, update the manifest only after source-truth verification, and record a successor Systemia release receipt. Never silently modify the expected SHA to make a broken canary pass.

The browser test uses open-source Chromium/WebKit in an isolated QA runner. The separate public Systemia Owned Browser Fabric remains held until host, authorization, isolation and runtime receipts meet its independent approval gates.
