# Fallen Studios documentary cinematic acceptance

**Status: quality gate implementation, not a finished documentary.** This is a guardrail for issue #1874 and the real-media proof in #1619. Systemia remains the execution and authority control plane. No public client media, conversations, rights paperwork, or credentials belong in this repository.

## Why this exists

The previous 48-second internal reel (SHA-256 \`23435f2110365ba0373daf223c23523dec23562a1db4ac83e850170d1c88ffe9\`) was **creatively rejected** despite a technically valid MP4 and audio QC. A local FFmpeg decode at 1 frame/second, 64×36 grayscale showed 0.00667 median normalized interframe luma difference; 91.49% of successive sampled frames changed by less than 0.025. It was primarily repeated title cards, not a source-led documentary. Keep it as **DO NOT SHOWCASE**. Its video bytes are not checked into GitHub.

New \`documentary-cinematic-gate.mjs\` treats static-like motion as an explicit *review flag*, not a mathematical proof of bad filmmaking. A locked-off interview may be excellent; a fast animated title-card slideshow may be terrible. Both require an actual full-video human review.

## A story and a film, not slideware

A candidate documentary teaser must have:
- A versioned, exact-master SHA-256, a contiguous 15–90-second shot timeline, and at least six named shots.
- At least **60% of runtime** assigned to original-camera or permission-cleared archival **moving video**, at least five footage shots, and at least three *distinct* video source SHA-256s. Identical files cannot be disguised as multiple sources.
- Title-card-only runtime at or below 20%. Maps, graphics and stills have independent attribution, but **never count as original moving footage**.
- At least two real-video shot scales and three narrative functions from orientation, observation, human perspective, evidence, consequence and reflection.
- Source hashes, reviewer-declared provenance, rights and privacy evidence. These fields are self-reported; **real file integrity and external rights authenticity are handled by the separate source-intake gate and independent human review**.
- A 1fps FFmpeg visual-activity sample, flagged if median absolute luma difference is below 0.012 and over 80% of successive samples have activity below 0.025. Suspected near-blank intervals are also flagged.
- Human viewing, named creative review tied to the exact MP4 hash. A low-motion exception needs written, source-specific evidence and a hash-bound signoff. Founder rejection is binding.

Passing this gate is still **not customer approval, payment authority, public portfolio permission or permission to publish**. Human reviewers must verify the factual claims and art direction separately. Do not claim this code understands visual beauty, news authenticity, camera truth, or emotional impact.

## Technical usage

After an authorized source-intake and a real Fallen render, create a **private** manifest with schema \`evercraft.fallen.documentary-cinematic-input.v1\`, \`expectedMasterSha256\`, \`sources\`, \`shots\`, and \`creativeReview\`. Store source path/consent in private evidence, not GitHub.

    node systemia/media-studio/documentary-cinematic-gate.mjs \
      ./private/final-master.mp4 \
      ./private/cinematic-manifest.json \
      ./private/cinematic-receipt.json

Exit 0: human-reviewed metadata package accepted for **private editorial preview only**. Exit 2: blocked/review required. Exit 1: inspection failure. The returned receipt is explicitly non-publishing and non-transactional.

The dedicated CI uses short synthetic moving and static FFmpeg fixtures solely to prove program behavior. Those fixtures **are not real camera sources** and are not client examples; their source receipts are fictional test-contract values.

## Real-shot creative direction (not an asset claim)

A first documentary-grade 60s teaser should contain an atmospheric observed opening, wide geographic orientation, a close-up human perspective or clearly attributed primary account, chronological evidence and readable map graphics, audible location ambience, a narrative consequence, and a closing question. Use independent primary sources for claims and label any reconstruction visibly.

**No footage from a prospective filmmaker's social posts without their written permission.** Neither a screenshot nor a public link grants editing, redistribution or portfolio rights.

## Acceptance remaining

Creative gate CI green -> owned-node runtime and decode proof -> licensed *real* moving source footage -> approved editable timeline -> excellent 1080p mix and final mastered export -> phone/desktop full viewing -> independently authenticated rights and editorial verification -> named founder signoff -> private client review -> scoped contract/payment/delivery. A green technical receipt does not eliminate any of these steps.


## November 15 source-to-final-pixels proof

The production CLI now requires an **authorized private media root** as its fourth argument:

    node systemia/media-studio/documentary-cinematic-gate.mjs \
      ./private/final-master.mp4 \
      ./private/cinematic-manifest.json \
      ./private/cinematic-receipt.json \
      /private/verified-camera-media

Each real \`sources[]\` entry must carry its actual absolute path, 64-hex SHA-256,
film-use consent declaration, rights and privacy evidence references, and origin
reference. Each footage \`shots[]\` entry must include \`sourceInSec\` so the
exact source trim can be checked. The source verifier checks bytes, file type,
video stream metadata, safe paths, and trim ranges. It requires three distinct
verified source files and at least 60% bound footage runtime before advancing.

The additional \`documentary-source-concordance.mjs\` inspector compares
grayscale decoded sample frames at each footage shot midpoint against the
corresponding frame in the exact exported master (SHA-256 bound). Default
minimum correlation is 0.58; the CLI does not accept a lowered threshold.
Mismatches are **blocked** for private editorial preview and require a
corrected edit or further human inspection and reviewed tooling adjustments.
Genuine reframing, multiple layers, transitions and heavy grades can cause
conservative false positives; similarity cannot authenticate news provenance,
licensing, artistic quality or all frames. A match at sample points does not
prove all pixels or all footage are legitimate.

**Important:** CI uses synthetic images/encoded videos with fictional test
rights solely to test failure behavior. No owned-node deployment or
rights-cleared client film has been completed by these new checks. Draft PR
review and real-world creative approval remain mandatory.


## Embedded third-party footage restriction (November 16, 2026)

**Observed source problem:** the downloaded 2020 Voice of America film from
Wikimedia Commons includes a frame with an **AFP** watermark. A film described
overall as federal/public domain can still contain separately owned embedded
images, wire footage, protected trademarks or individual privacy rights.

Real-video \`sources[]\` must now declare
\`embeddedThirdPartyStatus: "none_observed" | "cleared_per_shot"\`.
Missing, unknown or \`"suspected"\` **rejects** cinematic admission; do not
silently default missing to public domain. For a \`"cleared_per_shot"\` source,
every selected footage shot must carry a named segment-level review with
\`segmentRightsReviewed: true\` and \`segmentRightsEvidenceRef\`. The
editorial team must independently authenticate those references in the
private evidence vault: flags do NOT prove legal rights.

The real archive scout returned **two valid downloaded 1080p videos** in
https://github.com/jgaethle10/forge-operator/actions/runs/43977895088:
2019 CBP construction near **Yuma**, not Lukeville; and 2020 broader-border
Voice of America coverage. Both are legitimate technical test assets, but
neither is the photographer's 2023 footage. The official Lukeville DVIDS
downloads failed 3/3 with HTTP 403 in
https://github.com/jgaethle10/forge-operator/actions/runs/43977192962.

Source attribution, geography, capture date and non-endorsement are hard
editorial boundaries. No client publication or portfolio rights follow from
this technical proof; no new showcase reel has been approved.
