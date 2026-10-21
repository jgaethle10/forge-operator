# Evercraft Graphics | Founder Creative Rejection

**Date:** October 16, 2026  
**Artifact:** Six-image PNG contact sheet and related synthetic review gallery from Graphics MCP PR #1337  
**Founder response:** "That's ass lol"  
**Decision:** **REJECTED FOR SHOWCASE AND COMMERCIAL PORTFOLIO USE.** Engineering tests remain valid for byte-level raster integrity only.

## Root-cause review

The current six images demonstrate reliable SVG generation and PNG export, but are too similar in layout and visual language to serve as a design portfolio. Several pieces have the same generic headline and subdued hierarchy. Orbit rings, rectangle stacks and an initials medallion are filler ornaments rather than meaningful depictions of the work. The bar and line charts are technically readable but default dashboard cards, not editorial visual storytelling. The commercial sample hardcodes an unrelated funnel/audit graphic and illustrative price, even when the requested proposition is broader.

The six-at-once contact sheet further miniaturizes the art on a phone. This hurts inspection, but is **not the root cause**. Enlarging weak designs would only reveal the weakness more clearly. Previous reports overstated the design outcome by calling these outputs clean or close to world class from engineering tests. That conflated reproducibility with creative quality.

## Change in engineering approach

No more counting color/shape/ratio permutations as independent creative achievements. Those numbers are valid test-coverage metrics, **not design-quality metrics**. We must design around the subject and viewer:

1. **Start with one specific real capability.** Choose a verified Evercraft product, artifact, or process, and collect its authentic screenshots, real footage, actual scene renders or rights-cleared photographs where applicable. The "something graphic" brief should not be a production brief.
2. **Make the subject the dominant hero.** Use actual subject imagery or a contextually meaningful visual reconstruction; decorative rings, stacked rectangles and ornamental monograms alone fail for evidence-led product claims. A hero must earn its space by showing something the viewer would not understand from text alone.
3. **Use a single editorial message.** Prioritize short, dramatic hierarchy over paragraph-heavy cover slides. Put factual methods, source receipts and disclaimers in the accompanying accessible metadata/caption, without falsifying or hiding legally necessary notices.
4. **Art-direct per genre.** Technical simulation, cultural storytelling, disaster response, science visualization, commercial product explanation and live sports need different composition grammars; the same layout with a palette swap is not sufficient.
5. **Require real mobile and desktop visual reviews.** Inspect at intended on-screen size, full pixel size and thumbnail scale; test line breaks, legibility, safe areas, subject detail, accessibility and actual platform crop behavior. Attach the rendered image and reviewer decision to its receipt.
6. **Prove the meaning, not just a file.** If subject/source material isn't available, say so and hold the graphics job. No stock-fiction substitute or claim of photographic truth. A synthetic conceptual illustration must say so clearly.

## Release gates

**Engineering:** PNG magic, exact dimensions, identical-source hashes, unsafe external references, SSRF boundaries and deterministic replay.

**Visual:** human reviewer can identify the subject and proposition at a glance; composition genuinely differs by content; focal subject leads; typography readable on phone; no decorative prop confused for product illustration. These need real image inspection, not a score invented from source code.

**Evidence:** real/illustrative classification, licensed-source lineage, allowed claims and dates.

**Commercial:** approved offer and rights, authorized payment, fulfillment entitlement, actual deliverable review, and release approval.

The existing gallery's manifest must carry `founderVisualVerdict: rejected` and `presentationState: do_not_showcase`. Existing renderer and numeric tests should still pass: regression-proofing an internal renderer is useful even when we refuse its portfolio output.

## Next single-case challenge

Build **one** exceptional piece from an actual Evercraft capability with verified source assets. Recommended starting point: a *Fallen Studio excavation cycle* cinematic still using a real frame from the existing Fallen production proofs, with equipment/ground/material changes and meaningful context. If those original assets cannot be retrieved, source the next verified capability rather than fabricate evidence.

Brief: the image must visually explain what the system **actually did** before the viewer reads the caption. The headline should be optional. Produce feed and 16:9 hero crops from the same authenticated source with a documented shot treatment, plus actual PNG, asset lineage, and an independent visual review. Hold release until the founder approves one result.

**Do not repeat this gallery in marketing and do not call the new target complete until the resulting pixels have been inspected.**
