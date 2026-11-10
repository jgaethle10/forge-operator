# Fallen: customer commercial creative direction

This is a production-planning handoff for 30-second commissioned spots. It is not a video generator, payment interface, automatic outreach, or authorization to spend credits.

## Production outputs

1. An evidence-backed, thirty-second physical-action storyboard.
2. The hook in the first five seconds, with the named subject actually visible.
3. A proof beat referencing confirmed real business evidence, never invented reviews or rankings.
4. The exact client-confirmed call to action at the end.
5. Timecoded voice performance and music sheets, including delivery intention, pacing, breathing room, emphasis, pronunciation and energy changes.
6. A Fallen StudioDraftPlan and one registered Saban creative-council shot assignment per beat.

## Operator procedure

Collect confirmed business offer, goal, target audience, brand references, licensed or owned visual assets, evidence for product claims, CTA, and music direction. Keep actual customer materials private. Use the sample fixture at systemia/media-studio/fixtures/sample-commercial-direction.json as the example data shape.

Command:

    node systemia/media-studio/commercial-creative-direction.mjs ./private/client-brief.json ./private/client-direction.json
    node --test systemia/media-studio/commercial-creative-direction.test.mjs

Exit 0 means ready_for_director_review. Exit 2 means blocked. Exit 1 means invalid input or runtime failure.

The output includes a studioDraftPlan shaped for the existing Fallen compileStudioDraft function, and creativeJobs usable by the registered fallen-creative-council. If a shot has no approved existing visual asset, its need remains unresolved and paid generation remains OFF until separately authorized.

The performance plan flags scripts requiring more than 175 spoken words per minute. It does not speed up dialogue automatically. The opening line still needs a real audition and directed delivery. Saban role output is pre-production direction, not verification that video or sound was generated.

## Non-negotiable boundaries

No invented clients, offers, testimonial claims, consent or commercial-use rights. Human review remains necessary for believable cinematography, composition, voice naturalness, music, final audio, rights, mobile readability and client approval. The compiler issues no delivery or social publishing authority, and client approval for delivery never implies promotional repost permission.

## Source-film edit points

Each visual beat may provide visual.trimStartSec (seconds) when referencing an approved video asset. The compiler passes the trim to Fallen's existing timeline clip and FFmpeg exporter. If one source file is used in several beats, every beat must have a distinct explicit in-point so the commercial does not accidentally restart the footage from zero for each scene. The full source duration, when known, is checked against each beat's trim plus its scene duration. Source-image assets cannot be trimmed.

One source video can therefore be edited into multiple real shots without inventing replacement footage, duplicating asset rights, or paying for additional video generation. The final exporter still verifies the actual source file digest and produces its usual QC receipts. The demonstration uses four unique in-points from one fictional 30-second recording.
