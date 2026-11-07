# Evercraft Music Science & Production Standards | Research-to-Code Pass 2026-10-17

**Status:** Active research and implementation evidence, **not** a completed conservatory education, AI Boardroom consensus, mastered song or commercial release. Canonical engineering remains `jgaethle10/forge-operator` → Fallen/PulseGrid → draft PR #1371; no new DAW. The original `The Weight of Silence` master is immutable. Any positive sonic judgment must come from controlled human A/B listening.

## Mission and epistemic boundaries

The Evercraft AI Boardroom research session `6ad435242999313f38f026d3` has an `ask_all` run request **queued**; it is **not a provider-backed nine-seat debate** until independent model response records and provider receipts exist. Existing Saban media-studio CI runs deterministic requirements/provenance/timing checks in parallel. It does not generate performances, evaluate artistic taste or verify rights independently.

Our product needs four distinct deliverables: expressive musical writing; playable recorded instruments with authentic provenance; honest, repeatable audio engineering; and listener-reviewed compositions. Code passing is prerequisite, not the musical destination.

## Interdisciplinary curriculum and executable standards

| Study area | References and key distinctions | How it changes Evercraft engineering |
|---|---|---|
| Theory, form, harmony, counterpoint | [Open Music Theory v2](https://open.umn.edu/opentextbooks/textbooks/1254) covers interval/function, contrapuntal voice leading, harmony, chromaticism, jazz, form and orchestration. | A read-only `Music Theory Lab` describes actual MIDI motif recurrence, melodic leaps, harmonic pitch-class evidence, register overlap and velocity arc. It **never** labels a key or writes new notes with invented certainty. Ear + musician decides. |
| Instrument roles and orchestration | [Berklee Orchestration 1](https://online.berklee.edu/courses/orchestration-1) addresses idiomatic ranges, voicing, articulations, dynamics, MIDI/sample libraries and actual ensemble orchestration; [Writing String Pads](https://www.berklee.edu/berklee-today/fall-2018/writing-string-pads) shows how vibrato, dynamics and spacing change expressive focus. | Test part ranges, melody foreground/masking, note register overlaps, crescendo and articulation; keep piano melody, bass, cello, viola, violin, section strings and choir **individually editable**. Do not assume more layers always means better sound. |
| Composition for cinematic emotion | [Berklee screen-scoring curriculum](https://college.berklee.edu/courses/scrn-240) covers leitmotif, ostinato, harmony, modes, dramatic gesture, dynamic curves, form and ensemble size. | A motif development notebook should record original theme, repetition/variation, dissonance→release, phrase contour and the intended silence before any new arrangement. Suggestion only until musicians listen. |
| Piano acoustics/sampling | Attack is a hammer-string event; real instrument samples have timing, inharmonic partials, resonance, multiple dynamic layers and acoustic room/performer differences. Transposing sample `playbackRate` changes both pitch **and elapsed duration**, per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate). | Prefer genuine rights-clear recordings with documented root pitch, velocity, round-robin performances, key release and pedal state. Preserve ≤2-semitone transposition until human audition. A valid SHA/PCM waveform is not proof of real grand piano quality. |
| Timing and note articulation | Swing changes the duration of neighboring subdivisions; MIDI note length must integrate long and short steps, not multiply only the first step. [MDN AudioParam release scheduling](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime) documents smooth envelope principles. | New `pulsegrid-note-duration.mjs` integrates swung steps and fractional held notes. `instrument-foundry-piano.mjs` schedules ordered attack/key-off/end ramps even for short buffers. Test timing in the actual simulated Web Audio engine. |
| Recording/signal chain | [Berklee Music Production certificate](https://online.berklee.edu/certificates/music-production-professional) emphasizes microphones, acoustics, signal flow, gain staging and critical listening. | Actual source WAV intake evaluates PCM integrity, clipping, silence, DC offset, tail energy and pitch, but retains original bytes and source rights `unknown`. Separate capture setup/performer consents, microphone placement and room-noise receipts are still missing. |
| Mixing | [Berklee Art of Mixing](https://online.berklee.edu/courses/art-of-mixing) emphasizes tonal balance, masking, EQ, dynamic processing, automation, panning and spatial effects. | Build versioned gain-staged A/B between dry/wet, piano-only/full orchestration, comparable listening volume, mono compatibility and track bus levels. Do not mask weak writing with reverb/compression. Current player has filters, delay and a gain bus, not a verified world-class mix/master chain. |
| Mastering and true peak | [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770) is a loudness and true-peak measurement standard; [EBU R128](https://tech.ebu.ch/publications/r128) recommends **-23 LUFS for broadcast**, not a universal musical target. [AES true peak](https://aes2.org/resources/audio-topics/loudness-project/learn-more/) explains intersample peaks and oversampled true-peak assessment. | Future release/export must log measured sample peak vs true peak, integrated loudness, range, dynamics, mono/stereo, noise floor, clipping and codec. No invented measurements. No single arbitrary streaming LUFS enforced as a universal style rule; mastering is separate from arrangement and human playback approval. |
| Per-note expression | [MIDI Association MPE](https://midi.org/midi-polyphonic-expression-mpe-specification-adopted) extends pitch bend and expression per note. | Planned: piano sustain/damper and variable releases first; aftertouch, MPE pressure/timbre and independently verified pedal samples later. Current patch is root+velocity WAV selection, not yet full MPE or continuous acoustic physics. |

## First implemented fixes in this research pass

1. **Swing-aware note duration:** A two-step held note preserves the *sum* of long and short subdivisions. Prior implementation multiplied the duration of the first long or short step, changing sustain/release timings incorrectly. Fixed in the canonical `PulseGridAudioEngine`.
2. **Correctly ordered piano envelope:** Constrains attack and release to actual decoded sample duration, so very short buffers never have automation points scheduled after the source stops. Any 4 ms invalid sample is explicitly rejected instead of silently scheduling a bad voice.
3. **Music Theory Lab:** A collapsible, read-only part of existing Fallen Sessions summarizes actual piano-roll MIDI evidence: pitch-class weights, melodic leaps, recurrent three-interval cells, overlap between instruments, and four-part note-velocity contour. It deliberately reports `inferred_key:null`, `automatic_composition_changes:false`, `taste_or_originality_score:null`. This is assistance to musician judgement, not algorithmic compositional authority.
4. **Tests and release gating:** All additions run within PR #1371 using original `PulseGridSession`, existing CI, Saban capture preflight and the immutable recorded-source custody rules.

## First immutable composition baseline

Original reference bundle `Evercraft_The_Weight_of_Silence_Editable_Session.zip` contains a MIDI score, composition script and isolated stems. A read-only independent scan of the MIDI from inside the ZIP (no modification) observed **9 named instruments and 285 note events**; MIDI performance ends at approximately **63.44 seconds**. Named parts: piano bass (46 notes), piano figure (86), piano melody (48), cello (25), viola (16), string ensemble (27), solo violin (14), contrabass (7), choir pads (16). Top pitch-class frequencies (unweighted): D 51, Bb 45, A 44, G 41, F 39, E 37. This reflects score *content*, not a complete functional-harmony interpretation. MP3 reference SHA-256 `d0a6165198d55072db31d26729532d73fadfb844792ed3421afded328d1ed2c6` must remain unchanged.

The internal TimGM6mb SoundFont render has GPL-2-related rights issues requiring independent licensing review. No publication, ISRC/UPC, full distribution or replacement of the favorite original is admitted merely from this source.

## Adversarial listening/review roadmap

- Score team: assess theme, motivic identity, voice leading, form, tension/resolution, silence and human expression. Make a **source-linked observation**, not a generic "cinematic" compliment.
- Performance and orchestration team: check overlapping ranges, natural vibrato, string bowing/articulation, dynamic hierarchy, believable piano attacks/releases and clear foreground.
- Sound/recording team: document mic/room/capture chain, damping, phase, noise floor, clipping, pedal and sample velocity-layer provenance. Actual WAV proof required.
- Mix/master team: take dry stems, create versioned **loudness-matched**, mono-compatible and spatial A/B; measure and document levels instead of chasing a preset.
- Rights/security and contrarian team: independently challenge source licenses, ownership, AI/creative authorship, score originality, fabricated boardroom claims and "green tests = beautiful song" errors. Preserve accepted/rejected listening receipts.
- Final QA: founder + musician listens blind at matched playback level to unchanged original and new candidate; only a specific human-accepted improvement may be promoted. Boardroom responses are `unverified_pending` until distinct provider model receipts exist.

**Explicitly incomplete:** professional acoustic sample recordings, physically validated room/pedal physics, genuine browser/device audio capture, independent Boardroom model rounds, mastering measurements and musical A/B approval. These require real recorded evidence and cannot be conjured from documentation.


## Measured baseline: original `The Weight of Silence` MP3

A **read-only** FFmpeg EBU R128 + true-peak analysis of the frozen original `The_Weight_of_Silence_Piano_and_Strings.mp3`, SHA-256 `d0a6165198d55072db31d26729532d73fadfb844792ed3421afded328d1ed2c6`, produced:

| Measurement | Measured value | Interpretation and constraint |
|---|---:|---|
| Decoded MP3 duration | approximately 68.30 s | Rendering and MIDI duration differ; do not infer edits or offsets without timecode review. |
| Integrated loudness | **-15.8 LUFS** | Existing audition reference, **not** a mandated loudness target for future compositions. |
| Loudness range | **15.6 LU** | Significant long-form contrast. Future A/B should preserve intended soft-to-loud story instead of normalizing away dynamics. |
| True peak | **-1.9 dBTP** | Based on FFmpeg ebur128 true-peak estimation, not a certificate of full mastered distribution readiness. |
| Relative measurement threshold | -26.5 LUFS | Tool diagnostic only. |

Reproducible non-destructive command from the repository operator's machine, supplying the local rights-held reference file path:

```bash
ffmpeg -hide_banner -nostats -i The_Weight_of_Silence_Piano_and_Strings.mp3 \
  -af ebur128=peak=true -f null -
```

This matters **musically**: a lively dramatic range is part of the listening identity of the original. A new supposedly "better" master must be loudness-matched for subjective comparison without automatically flattening this range, and any release needs independent rights, mastering, codec/true-peak and platform checks. The reference MP3 remains untouched. FFmpeg measurement does not establish sample licensing, authorship, originality or waveform authenticity.



## Read-only arrangement arc: source MIDI

The original MIDI extracted **in memory only** from the immutable editable-session ZIP provides a useful orchestration-density baseline. Dividing MIDI-time into four equal windows, without asserting this is the only phrase structure:

| Quarter of MIDI time | Note-on events | Mean MIDI velocity 0–127 | Active named instrument parts |
|---|---:|---:|---:|
| First | 44 | 47.98 | 4 |
| Second | 78 | 52.13 | 8 |
| Third | 113 | 55.60 | 9 |
| Fourth | 50 | 47.72 | 7 |

Entrances provide useful evidence of intentional expansion: piano bass at 0.00 s, piano figure 0.10 s, melody 0.41 s, cello 8.37 s, viola and string ensemble ~16.3 s, solo violin 21.94 s, choir ~29.41 s, contrabass ~31.98 s. This shows a buildup of **layer count and MIDI activity** and a thinner fourth quarter, without automatically proving perceived loudness or artistic success. Don't conflate MIDI velocity with acoustic LUFS.

For a future *Weight of Silence* successor, compare the **phrasing, silhouette of instrument entrances, foreground clarity, silence and low-end gravity** against this baseline, not just whole-file peak loudness. A MIDI count is a description, not an instruction to increase note density.


## Incremental implementation: complete chromatic evidence and chord-safe motion

The existing read-only `pulsegrid-music-insights.mjs` now emits all twelve chromatic pitch classes in C-to-B order with note counts and bounded duration×MIDI-velocity weights, plus a separately derived five-class ranking. This fixes the historic top-five representation/test disagreement without discarding softly represented notes or inventing a tonic. Empty and unused pitch classes remain explicit zeros. The actual Fallen Sessions Music Theory Lab shows both the compact and full views. Reference: [Open Music Theory, twelve-pitch-class cycle](https://openmusictheory.github.io/atonal.html). MIDI velocity is **not** a measured acoustic loudness value, and the chosen enharmonic names are display spellings, not inferred harmonic function.

Horizontal interval analysis now groups notes starting at the exact same canonical step. Simultaneous chord tones are excluded from single-line leap and repeated-interval-motif inference, while still contributing to register and pitch-class evidence. New `stacked_onset_groups` and `melodic_interval_pairs` counts explain when a part is too polyphonic for trustworthy melody evidence. Closely spaced arpeggios and overlapping counterpoint still require individual voice assignment and human interpretation; this is deliberately a conservative analyzer, **not** an automatic counterpoint engine.

Regression tests explicitly require D/F preservation when lower-ranked, all 12 classes including zeros, no fabricated key, true single-note melodic leaps, and no phantom melodic leaps from simultaneous chords. Dedicated CI and full Forge checks must be read separately after these changes. This is an engineering improvement, **not** evidence of newly recorded instrument samples, a superior musical performance, a finished Boardroom deliberation, or a released master.


## Incremental implementation: conservative two-part counterpoint evidence

New `pulsegrid-counterpoint-evidence.mjs` adds a **non-destructive** view of synchronized voice movement using actual canonical MIDI note onsets in *distinct* synth tracks. For each pair of clearly aligned, singleton note onsets, it measures interval classes, contrary/oblique/similar motion, and repeated perfect fifths and octaves/unisons. Evidence is exposed in the existing Fallen Sessions **Music Theory Lab** with bounded examples and exact source-note pitches and steps. The output contains `automatic_note_changes:false`, `inferred_key:null`, `real_audio_masking_measured:false`, and `human_musician_review_required:true`.

**This analyzer is intentionally narrower than actual four-part species counterpoint.** It makes no inferred voice identities inside polyphonic chords; skips overlapped/legato notes where a prior note remains sounding in the same track; and does not join two synchronized events if either part had intervening independent note onsets. That avoids describing arbitrary piano chords and orchestral arpeggios as a single melodic voice. Full counterpoint across chord voices will need explicit voice IDs or source score annotation.

Classical parallel fifths and octaves may be forbidden in some strict counterpoint exercises, but *not* universally undesirable in cinematic doubling, popular harmony, ensemble orchestration or deliberately parallel motion. The lab offers **listening questions**, not red warnings or automated rewritten notes. Read [Open Music Theory](https://openmusictheory.github.io/) alongside actual orchestration examples, and preserve the composer's stylistic intent. No model should claim measured masking without actual audio.

The dedicated `pulsegrid-counterpoint-evidence.test.mjs` uses canonical transaction-built PulseGrid sessions and checks parallel fifths, octave doublings, contrary and oblique movement, chord-onset ambiguity, sustained overlap, intervening unsynchronized melody notes, time-offset parts, interval-class evidence, note mutation resistance and bounded error handling. The UI smoke tests confirm the separate display does not invoke graph mutations. The original *Weight of Silence* master remains immutable and is not regenerated or distributed as part of these tests.

**Concurrency note:** This module and its UI integration were added to the existing PR #1371 while a parallel sound-engineering thread has been directed to distinct DSP, mastering and capture work. Coordinate file edits by refetching blob SHAs; neither side may claim another team's output or merge prematurely.


## Arrangement Arc: bar-level evidence inside canonical Fallen Sessions (Oct 26)

The read-only `pulsegrid-arrangement-arc.mjs` module and the nested `Music Theory Lab → Arrangement Arc` review surface now count **written** MIDI onsets by bar, pitch-part presence across note sustains, first entrances, re-entries after gaps, departures, authored velocity averages and bars containing no pitched MIDI sound. A held note spanning a barline adds sounding presence, **not** a fictitious new attack. Exact note-offs on a boundary do not carry over. This is useful for noticing orchestral entrances, density changes, and where human listeners may want to check the breath of a phrase.

**What it does not claim:** the emotional intensity of a bar, acoustic loudness, real audio silence, playable sample quality, licensing or mastered sound. Drums, imported audio, reverb/delay tails and sample-resonance are excluded. Muted and probabilistic notes are included as authored score evidence, not guaranteed playback; the UI labels that distinction. No MIDI writes, hidden AI taste scoring, automatic expression edits, or modification to original `The Weight of Silence` reference assets occur.

Eight targeted Node regression cases cover empty score/non-mutation, late entrances and exits, sustain over bar boundaries, re-entry, exclusion of non-MIDI tracks, density/velocity observations, fail-closed invalid data, and 4,096-note bounds. The new tests are included in the pre-existing Instrument Foundry workflow. **Local tests passed; GitHub Actions/TypeScript and browser visual review must independently pass on the final pushed commit.** This is an arrangement-inspection improvement, not proof that the new instrument sounds better.
