# Fallen | Private Preview Desk (2026-11-18)

This is an **operator-local review tool**, built on the real Fallen timeline version vault, not a customer-facing account or public hosted editor. It can display existing MP4 previews for specific, verified project versions and save exact revision feedback against the selected version. It does **not** create a new cut, run Saban, claim quality approval, or deliver media.

## What a user can do

1. Choose among existing approved-for-private-review video versions in the local page.
2. Play or scrub an MP4 file, with HTTP byte-range support for standard video seeking.
3. Write a change in plain language, such as "Keep the opening, but make the ending more exciting."
4. Save a local JSON review note bound to the **exact project-version digest and MP4 SHA-256**. The note is not a production instruction until independently reviewed and admitted.

The interface intentionally shows only version labels, playback and one note box, rather than a full timeline.

## Starting a private session

The operator must already have:
- A private root used by Fallen's version vault, containing the exact project timeline snapshots.
- Original pre-verified MP4 preview files on disk. The desk **never renders** a preview master.
- Rights/approval evidence for each private preview. The manifest contains operator-supplied attestation, **not independent validation**.
- A local private media directory and an operator-controlled notes directory. Do not expose the service using a public proxy, port forward or LAN binding.

A manifest is a private JSON file with this shape:

~~~json
{
  "schema": "evercraft.fallen.private-preview-desk.v1",
  "projectId": "customer-project-001",
  "previews": [
    {
      "projectDigest": "<SHA-256 of an existing timeline-vault version>",
      "relativeMediaPath": "approved-preview-v1.mp4",
      "mediaSha256": "<SHA-256 of those exact video bytes>",
      "privateReviewAuthorized": true,
      "reviewAuthorityReference": "private:operator-approval-reference",
      "label": "First private cut"
    }
  ]
}
~~~

No sample digest above is a real digest. No secret, user information or customer footage should ever be committed to GitHub.

Run on the **same owned workstation** as the approved private MP4s and timeline vault:

~~~bash
node systemia/media-studio/private-preview-desk.mjs \
  /private/path/preview-manifest.json \
  /private/path/timeline-vault \
  /private/path/review-media \
  /private/path/review-notes
~~~

It reports a newly randomized loopback URL on 127.0.0.1, usable only while that process runs. The local capability token is not a login or customer authentication. Do not share the URL or port-forward it.

## Security and truth boundaries

- Every preview must correspond to a real, digest-verified Fallen version-vault entry. Media paths must stay under the operator media root; directory traversal and symlinks are rejected. MP4 container marker, size and **full file SHA-256** are checked before serving bytes. A file may still be unplayable because this tool is not a full codec-validation or quality gate.
- The server binds **only to 127.0.0.1**, uses an ephemeral capability path, CSP, no-store headers, no-referrer and no remote scripts or styles. POST notes require a matching local Origin, JSON content type and an explicit non-simple header, preventing ordinary cross-site form submissions.
- Review notes are written as new 0600 local files with source version and media digests. The tool never overwrites an existing note, publishes, charges, runs a provider, or silently mutates a timeline.
- All private project authorization, operator identity, licensing and source-media approvals remain obligations of the caller. The private capability URL is not an adequate control for internet-facing service. The system is not customer-ready SaaS.
- Existing on-disk MP4 files are read locally. The server does **not** upload them, but a local viewer with the full randomized session URL can stream them while the tool is running.

## Verification

~~~bash
node --import tsx --test \
  systemia/media-studio/private-preview-desk.test.mjs
~~~

The tests use synthetic MP4 *header bytes* to prove HTTP range handling and SHA verification. **They are not decodable film footage or media-quality proof.** Further browser playback tests must be run with real rights-approved MP4 assets before describing this as verified video playback on customer devices.

## Next layer

Authenticate named customer projects through Evercraft-owned storage and a trusted, access-controlled gateway; derive approved media manifests from evidence-backed studio masters; provide private browser sessions to invited customers; connect saved notes to actual Saban revision planning, Shot Tournament, media QA and approved version export. None of these are implied by the private loopback desk.
