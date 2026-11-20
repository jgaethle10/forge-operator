# Harbor founder editorial | owner-signed evidence receiver

**Deployment state, November 20, 2026:** implemented **source-only**, with CI proof against synthetic signed records. No real Harbor resident installation, real independent research signer, owner-host trust directory, private signed source bundle, current human editorial review, or provider post is asserted.

## The gap this closes

The source-level founder editorial gate (#2458) was connected to the Systemia→Harbor public-safe evidence handoff (#2466). That handoff still required operator callbacks for \`isRegisteredProducer\`, \`verifySourceReceipt\` and \`verifyPublicProjection\`, with no actual owner-local authenticator. A packet author could not be allowed to supply those callbacks or set a \`verified:true\` field.

\`systemia/newsroom/owner-signed-founder-handoff.mjs\` now supplies them from **cryptographically verified, separately owner-pinned, signed Lineage receipts**, using \`systemia/lineage/signatures.mjs\`. It then invokes the existing \`prepareSystemiaFounderCreatorReview()\`, which invokes the original five-document founder preflight. No duplicate newsroom policy, publisher or agent runtime is created.

## Real owner-host trust setup requirements

An independently authorized operator must provision **two different current public-key trust records**, stored as an owner-only JSON file in a private directory outside the incoming untrusted candidate's directory. This contract is \`evercraft.systemia.harbor.owner-trust.v1\`:

\`\`\`json
{
  "schema":"evercraft.systemia.harbor.owner-trust.v1",
  "entries":[
    {
      "key_id":"actual-aaar-key-id",
      "role":"producer",
      "department":"aaar",
      "actor_type":"agent",
      "actor_id":"registered-aaar-agent",
      "status":"active",
      "public_key_pem":"ACTUAL_PINNED_ED25519_PUBLIC_KEY_PEM"
    },
    {
      "key_id":"actual-systemia-key-id",
      "role":"systemia",
      "department":"systemia",
      "actor_type":"service",
      "actor_id":"registered-systemia-projection-service",
      "status":"active",
      "public_key_pem":"ACTUAL_SEPARATELY_PINNED_ED25519_PUBLIC_KEY_PEM"
    }
  ]
}
\`\`\`

**Never copy these illustrative identifiers as if live.** Keys must be enrolled and approved through the *actual* owner identity process. Both source and projection signers need distinct key IDs and actor identities. Private signing keys never go in the packet, the public website, GitHub or this chat. Public trust entries must not be taken from incoming source data.

The incoming owner-private \`evercraft.systemia.harbor.founder-signed-bundle.v1\` contains:

- \`upstream_record\`: the existing \`evercraft.systemia.harbor\` source record, with actual producer/mission/artifact/revision/source-receipt identifiers, a public-safe summary, source-bound public claims and evidence-state uncertainty.
- \`creator_draft\`: the *private* \`evercraft.creator.personal-post-candidate.v1\` object, including the exact proposed text, angle, source list and \`upstream_claim_id\` / \`copy_span\` links to the signed upstream claims. **This is not authorized personal copy** until the founder reviews it.
- \`producer_attestation\`: real \`evercraft.lineage.attestation.v1\` Ed25519 proof from the independently pinned producer identity. Subject type \`systemia-harbor-source-receipt\`, ID = exact upstream \`artifact_id\`. Signed claims require \`scope:systemia.harbor.source-read\`, exact source department, mission, artifact, revision, source receipt reference, SHA-256 of the canonical **entire upstream record** and a bounded expiration.
- \`systemia_attestation\`: separate pinned Systemia Ed25519 proof. Subject type \`systemia-harbor-public-projection\`, ID = the same artifact ID. Signed claims require \`scope:systemia.harbor.public-projection.review\`, the same source identities, hash of the entire record, hash of the exact public-safe \`{summary,claims}\` object and hash of the complete verified **producer attestation**, plus bounded expiration.

The signatures are produced by the **existing** Lineage \`createAttestationPayload()\` and \`signAttestation()\` functions, not by this verifier. An authenticated research producer and independently authorized Systemia projection operator must first check real source material and privacy status before signing. **Neither the signature nor a source URL proves the original scientific statement is true.** The signed proof certifies accountable provenance and that exact declared public projection, not independent online fact verification.

Every signed envelope has a recent issue time (no more than 24h old; max 1 minute future skew) and not-yet-expired time, with at most 48h issue-to-expiry. An expired packet cannot be replayed as a fresh "today" story.

## Owner-only observation command

On an authorized non-root machine with an actual owned checkout of current \`main\`, an operator can place the **source bundle and independent trust registry in separate owner-only 0700 parent directories** and each file at 0600. Then run:

\`\`\`bash
node systemia/newsroom/owner-signed-founder-handoff.mjs \
  --bundle /actual/private/incoming/founder-story.json \
  --trusted-keys /different/owner-private/trust/systemia-harbor.json
\`\`\`

Paths are placeholders. The program **reads only**; it does not create or overwrite source files, install services, access social accounts, fetch external news, contact the signer or create keys. It rejects symlink/hardlink files, world/group-accessible parents or files, altered files, root execution and untrusted same-directory trust configs. It prints only redacted receipt digests and states, not original private copy, PII, public-key PEM, customer records or signer secrets. The bundle owner can still deliberately assert false prose; no automatic prose quality evaluator can eliminate that risk.

Successful syntax, signature checks and all original creator policies yield **\`READY_FOR_INDEPENDENT_EDITORIAL_REVIEW\`** only. It is not \`PUBLISH_READY\`. A separate actual editorial reviewer must check fact/source freshness, founder voice, image/video rights, exact copy and platform safety. The founder's personal account remains manual and independent from Harbor's corporate Facebook Page authority.

## Fail-closed boundaries and tests

- No enrolled independent owner key or revoked/mismatched role or key -> \`HOLD\`.
- Modified source, wrong revision, stale or invalid producer proof -> \`HOLD\`.
- Replaced public projection, wrong signer or producer proof digest -> \`HOLD\`.
- Fabricated creator claim, missing source binding, exaggerated truth state or made-up style rule -> \`HOLD\`.
- Wrong account type, fake personal-profile authorization, stale policy or missing real documented founder example -> \`HOLD\`.
- Real signed source records with insufficient source corroboration must remain \`HOLD\` **at the editorial review and original source-verification stage**, not mislabelled "fact checked."
- A local passing report does not prove receipt delivery to Harbor. Authenticated machine pickup and ACK must be verified separately, with a durable dedup key and source revision before a production resident may claim operational adoption.

\`\`\`bash
node --test \
  systemia/newsroom/systemia-harbor-upstream.test.mjs \
  systemia/newsroom/founder-creator-upstream.test.mjs \
  systemia/newsroom/owner-signed-founder-handoff.test.mjs \
  systemia/creator/founder-editorial-preflight.test.mjs
\`\`\`

Existing \`.github/workflows/systemia-harbor-upstream.yml\` now includes this test. GitHub CI intentionally **never has live owner keys or customer/creator personal copy**.

**Next live acceptance:** Harbor operator obtains one truly sourced and legitimately signed AAAR or TOWI public-safe packet, separately provisions owner-pinned trust, verifies it on an actual owner host, obtains source-specific independent editorial review and a real Harbor pickup/ACK receipt. The Hubble drafts are still unapproved and not posted. Do not invent a signature, a verified post, or completed research to satisfy a launch status.
