# Entire Black Box | Release gate (engineering candidate, NOT published)

This directory contains a controlled experiment for taking the existing, read-only Evercraft Black Box command toward the [Entire CLI external-command protocol](https://github.com/entireio/cli/blob/main/docs/architecture/external-commands.md). The candidate does not authenticate provider side effects, accept payments, enroll agents, recover real actions or claim production readiness.

## Verified release shape

The *candidate* uses the independent project name `entire-blackbox`, command name `entire blackbox`, and the [Entire plugin-index asset conventions](https://github.com/entireio/plugin-index). The CI producer creates six archive assets:

- `entire-blackbox_0.1.0_linux_amd64.tar.gz`
- `entire-blackbox_0.1.0_linux_arm64.tar.gz`
- `entire-blackbox_0.1.0_darwin_amd64.tar.gz`
- `entire-blackbox_0.1.0_darwin_arm64.tar.gz`
- `entire-blackbox_0.1.0_windows_amd64.zip`
- `entire-blackbox_0.1.0_windows_arm64.zip`

Each archive contains *only* the executable `entire-blackbox` or `entire-blackbox.exe`. `checksums.txt` contains SHA-256 for the six archives. File timestamps/owners and Go build metadata are normalized. Verification is independent of a build job and rejects corrupted archives, unexpected entries, symlinks and wrong executable identities.

The GitHub Actions upload artifact is ephemeral CI evidence, **not a public GitHub Release**. An archive SHA matches its manifest here because both originate from this CI build, not because it has an externally anchored publisher signature. This is not a software supply-chain attestation or independent developer endorsement.

## Release sequence, not yet authorized

1. Obtain canonical Systemia admission, ownership/IP review and independent safety review. Do not merge another Black Box engineer's unrelated draft or broaden signing authority.
2. Create a separate public owned Git repository named `entire-blackbox`, using a scoped release workflow. This current GitHub connector can update existing repos but does not have an approved repository-creation operation. **No such repository is claimed here**.
3. Import vetted product source with provenance, a concise security/limitations README, Go module, test suite, and appropriate LICENSE after ownership/legal review.
4. Publish a stable semver tag (e.g., `v0.1.0`) and a GitHub Release with all six filenames above and `checksums.txt`. Verify the public release assets and source tag by fresh HTTP/Git readback, and run `entire plugin install https://github.com/jgaethle10/entire-blackbox --yes` against the actual public release in an isolated environment. **This command is a future acceptance test, not evidence of an existing URL or release.**
5. Ask Entire maintainers for technical fit and permission before proposing an entry in their public `index.json`. Approval, discovery, installs and usage remain unknown until observed.
6. Demonstrate one consented customer workflow with authenticated provider readback; keep outcome UNKNOWN where provider state is not independently confirmed. No attributable impact = no revenue-share invoice. Only after scope, delivery obligations, payment authority and a valid buyer agreement may paid licensing be offered.

## CI proof limits

A successful detached consumer job proves GitHub Actions artifact transport between runner jobs, archive integrity against the uploaded checksum manifest, real Entire **local-file** installation and CLI dispatch. It does **not** test the remote GitHub Release installer, actual catalog index, third-party buyer adoption, external provider-effect verification, durable trust authority or settlement through Evercraft Payments.

The entire branch is scoped to packaging, verification and CI. It does not deploy an agent, mutate real provider state, submit to Entire, contact a prospect, or alter the base Black Box implementation.
