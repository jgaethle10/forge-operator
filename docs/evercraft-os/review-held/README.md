# Evercraft OS review-held source intake

**Status: REVIEW HELD. Draft integration PR, not production permission.**

The pinned source archive remains immutable here. This PR now also adds **37 additive \`systemia/evercraft-os/*.mjs\` source and test modules** as individually reviewable Git files. The combined-source CI job checks that each imported file is byte-identical to the sealed archive, before running all canonical + imported OS tests and the Phase 0 composition proof.

- Archive SHA-256: \`f5eaaf096dce8b12c0dd56198682b6953eca9cda505236eece5e519ceaf32aaa\`.
- Archive blob SHA: \`b03f98a9ccecc3b85e8a3c7974cc06e93ab9fab6\`.
- Original unprivileged Linux offline suite: **169/169**.
- Canonical Passport blob SHA at intake: \`10ca99a6fcb496828943b240b7e373f0a52ca875\`. **Passport was not overwritten.**
- Systemia evidence receipt: \`release:evercraft-os:external-witness:20261013:f5eaaf09\`, **production blocked**.

The source is being imported for code review, static verification, and isolated CI. **No OS entrypoint is wired to invoke the new modules.** This PR does not set up independent monotonic witness service, real key custody, production app updates, real device enrollment, process sandboxing, automated crash recovery, Home HTTP routes, public ingress, payments, or workloads. Lab signatures/permits are not production authority.

Before any merge or deployment, independently review Identity, Passport, Execution Gate, NodeSeed, Yard and runtime activation contracts; finish broader canonical CI; establish explicit rollout authorization and observed physical-device health. A green local or GitHub test cannot stand in for any of those gates. The exact upstream integration map remains included in the sealed archive.
