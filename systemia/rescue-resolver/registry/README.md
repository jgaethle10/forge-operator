# Rescue Mesh registry v1 | safety and admission

**Scope:** Experimental signed registry for authorized, opt-in browser recovery. This is not a browser release, a registrar workaround, or evidence that the original domain is now restored.

## Trust model

1. An independent operator/approved domain manager must establish a subject domain's ownership or delegated consent **outside** the manifest. The user-provided `authority_verified: true` flag is not proof on its own. The verification/pinning ceremony is still unimplemented and must not be fabricated. A legitimate pinned Ed25519 public key and `minimum_revision`, plus an independently reviewed exact HTTPS `approved_mirror_origins` allowlist, are prerequisites.
2. An owner-authorized signer creates a strict `evercraft.rescue.manifest.v1` with exact `subject_host`, revision, issuance/expiry (maximum 72 hours), non-impersonating independent-information notice, and 1–4 exact HTTPS mirror URLs plus content markers. Every byte of the canonicalized payload is signed with the Ed25519 key. Private keys are never stored in the repository.
3. A *separately signed and fresh* `evercraft.rescue.revocation.v1` under the same owner key is mandatory. Without it, the registry refuses to select mirrors. `revoked_through_revision` and the trusted local minimum revision prevent replay of older records.
4. Each signed mirror URL must belong to an independently pinned approved origin. A read-only health probe checks candidate URLs in priority order, rejects redirects, HTTP errors, non-HTML bodies, missing markers and large responses. Marker-based checks only prove expected page fragments, **not** the true identity, security or policy compliance of remote content.
5. The registry emits a potential healthy destination. It has **zero DNS/GoDaddy privilege and no automatic redirect authority**. The browser must separately obtain informed user consent and present the different destination, verified provenance, an easy Disable control, and a revocation explanation.

## Threat review

| Risk | Guardrail in prototype | Remaining work |
|---|---|---|
| Unrelated actor claims to own a hostname | Exact hostname and pinned public key required, signatures mandatory | Real owner/registrar delegation verification ceremony, independent evidence provenance |
| Malicious alternate site | Strict HTTPS URL, independently pinned exact mirror origins, explicit notice, owner-signed mirror inventory, no URL parameters, no redirects | TLS/cert verification receipts, durable website content attestation, anti-phishing review |
| Forged or modified manifest | Fixed-key Ed25519 verification on canonical payload | Safe key rotation protocol |
| Stale or revoked version | Max 72h validity, fresh signed revocation, minimum revision floor | Durable client high-watermark storage, multi-source transparency log |
| Payment subdomain interception | Existing browser extension matches only apex and www; donation subdomain excluded | Future manifest-to-browser integration must preserve exclusions and user consent |
| Health false positives | HTTP 200+HTML+all owner-pinned markers required | Browser proof, multi-region checks, body hash policy if warranted |
| Owner/account consent missing | Reject if no independently trusted owner key | Must not auto-deploy for voteroman.com while ownership is unresolved |
| Involuntary routing | Registry never activates redirect | Human-facing signature verification and revocable opt-in UI pending |

## Roman-specific authority status

Because the GoDaddy account for `voteroman.com` is controlled by Paola, we currently have **no independently verified owner signing key or DNS write delegation**. Do not manufacture or self-issue a Roman owner manifest, route ordinary browser visitors, trigger account recovery, contact Paola/Roman, or disturb `donate.voteroman.com`. The prior, explicitly opted-in browser lab prototype remains separate and does not imply owner endorsement. The independent information mirror is at `https://fabric.systemiacommandcenters.com/campaigns/roman/`.

**Global restoration** remains a registrar/hosting authority action. This prototype is foundational research for a voluntary rescue protocol after valid authorization.

## Tests and evidence

`node --test systemia/rescue-resolver/registry/verified-registry.test.mjs`

Uses ephemeral Ed25519 keypairs generated inside tests, forged/expired/revoked/replayed fixtures and mocked HTTPS responses. No campaign website, registrar, key or user device is changed.

CI: `.github/workflows/evercraft-rescue-resolver.yml` runs these tests alongside the disposable real-Chromium consent/redirect proof. Tests and green CI are not a deployment receipt.
