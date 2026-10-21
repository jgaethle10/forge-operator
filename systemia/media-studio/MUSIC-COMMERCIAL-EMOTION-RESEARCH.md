# Evercraft Music & Commercial Sound: evidence-to-production decisions (2026-10-20)

This is a research-informed **production brief**, not an AI Boardroom consensus, an emotional-quality score, a release approval, or evidence of independent expert agents working. Human producer/founder auditions and licensed-source documentation remain required.

## Five intersecting disciplines and testable consequences

| Lens | Evidence and limitation | Existing Evercraft implementation / decision |
|---|---|---|
| Music psychology & composition | Musical expectation and sensory prediction shape enjoyment, but listener preferences and culture vary. See: https://pmc.ncbi.nlm.nih.gov/articles/PMC10725761/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC10798497/ | **Protect the score's meaningful rests**. Use the existing non-destructive Music Theory Lab phrase and counterpoint insights in PR #1371 as prompts for human orchestration; do not auto-quantize, fill every rest or classify emotions from note counts. |
| Musical reward & connection | Anticipation and emotional peaks can engage different reward responses; this is not a deterministic composition formula. See https://pubmed.ncbi.nlm.nih.gov/21217764/ | Compare restrained vs early orchestral entrances and resolution timing, level-matched, with blinded real listeners. Keep the *Weight of Silence* original immutable. |
| Advertising/marketing | Music can increase attention but high-frequency background changes can impede spoken brand-message recall. A 2024 ad study found different effects of music valence on brand recognition vs buying intention, not a universal style preference. See https://onlinelibrary.wiley.com/doi/full/10.1002/mar.20580 and https://pubmed.ncbi.nlm.nih.gov/39032271/ | Commission both **music-only emotional edit** and **dialogue-forward edit**. Test real message recall and comprehension after listening. Make space under pricing, product benefit and CTA. Never market creativity using fabricated neuroscience guarantees. |
| Production and dialogue intelligibility | AES TD1009 (Nov 2025) treats intelligibility across capture, mixing, loudness, playback and hearing conditions. See https://aes.org/community/technical-council/aestd1009/ | Existing `audio-master.ts` has role-separated voice/music/sfx buses and music ducking, but software filter presence **does not prove** words are understandable. Listen at phone speaker volume, headphones, TV and noisy environment; compare against quiet-voice and dense-score versions. |
| Mastering and recording evidence | ITU-R BS.1770-5 defines loudness and true-peak measurement. EBU R128 and Tech 3343 distinguish content genres and warn that LRA is not a meaningful short-ad metric with few short-term samples. See https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/ and https://tech.ebu.ch/docs/tech/tech3343.pdf | New `audio-loudness-evidence.ts` independently measures the **encoded delivered file** using FFmpeg `ebur128=peak=true`, records I, LRA, true peak and max short-term where available, without pretending it proves mix quality or publication authority. Keep requested mastering targets distinct from observed values. |

## Concrete 30/15/6-second production audition protocol

1. Use one rights-cleared voice take and one rights-cleared **recorded** instrument stem, with hashes and source consent evidence.
2. Preserve an untouched reference version and original timeline. Create an alternate edit with strategic entry/exit, real pauses, dialogue-focused ducking, no audible pumping.
3. Export all cuts with matching encoders and playback conditions. Run actual post-encode loudness and true-peak analysis. Report measurements, not target settings. For 6-second edits, do **not** treat LRA or max 3s short-term as reliable emotional scores.
4. Blind compare: scene comprehension, exact product/brand recall, emotional authenticity, first-second hook, clarity on phone, music stand-alone quality, audible pumping, distracting releases and CTA intelligibility. Count disagreements and keep original if new edit loses.
5. Sound-team release gate: engineering tests + source rights + honest narration + listening receipts + human sign-off. No publication based only on CI.

## Boardroom/Saban truth boundary

The earlier Evercraft AI Boardroom music-science session was queued with zero confirmed provider-backed seat replies at last known inspection. The currently connected public Evercraft capability directory is **not** an agent-dispatch interface. This research packet may be offered to Boardroom seats later; do not represent it as their independent review. The deterministic Saban media-studio checks in Foundry #1371 inspect supplied requirements, not human artistic taste or recording ownership.

## Sound quality direction

Prioritize authentic recorded performance over oscillator imitations for piano, bowed strings and orchestral timbres, with verified sample licenses. For commercial work, win trust with audible naturalness and intelligible words before layering production spectacle. The music should leave intentional air in the arrangement and earn each crescendo.
