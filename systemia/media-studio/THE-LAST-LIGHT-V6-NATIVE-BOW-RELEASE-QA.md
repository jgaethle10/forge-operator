# The Last Light | V6 Recorded Bow-Off Experiment

**Founder acceptance status:** UNREVIEWED. The original 35-second Steinway piano was loved; every orchestral version so far has been rejected for tone, melody fit or both. Do not call V6 a finished song, a played string ensemble, or a true recorded legato instrument.

**Protected piano master:** exact SHA-256 `630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e`. Every audition starts from those unchanged 24-bit PCM bytes. Instruments join after 9 seconds and retire before 29 seconds.

## Experiment, not marketing

Before V6, note samples were shortened and given a generic 380 ms synthetic cosine fade. The new renderer uses the recorded instrument's original **bow-off release tail**, cut from the same original VSCO 2 CE WAV and spliced onto the authored note's shortened sustain with a 120 ms equal-power crossfade. A 4 ms anti-click guard preserves natural bow attack. No added oscillator, synthetic vibrato, fake sampled legato, mastering limiter, or piano gain change. This is **recording-derived release articulation, not a newly recorded musical transition**. Software splices may still sound unnatural, and real performed E3-G3-E3 cello and E4-G4 violin transition recordings remain necessary.

## Actual recorded-source and pitch proof

| Sample | Pitch deviation at periodicity check | Original raw WAV SHA-256 prefix | Articulation |
|---|---:|---|---|
| `susvib_E3_v1_1.wav` | −2.8 cents | `d2f961e30bf64021` | cello soft |
| `susvib_C3_v1_1.wav` | +0.6 cents | `a614ee7ca821b446` | cello soft |
| `susvib_G3_v3_1.wav` | 0.0 cents | `17df597c259a8498` | cello strong |
| `LLVln_ArcoVib_G4_p.wav` | −7.7 cents | `ad1ba8442a6b4091` | solo violin soft |

All recordings are checked against a pre-existing independently fetched GitHub Git-blob SHA-1 and SHA-256, and an independent autocorrelation fundamental estimate. Raw VSCO source bank came from completed [Github Actions recorded-bank intake 39852668286](https://github.com/jgaethle10/forge-operator/actions/runs/39852668286); source download/upload was verified. No unregistered source is admitted.

The sparse score deliberately gives the piano priority: cello E3 at 9.18s, C3 at 16.02s, G3 at 19.42s, E3 at 25.75s. Violin G4 at 19.8s only. Both variants have the same pitch score; `V6_Cello_A_Generic_Fades_Instrument_Closeup` vs `V6_Cello_B_Actual_Recorded_Bow_Release_Closeup` isolate release behavior. They measure −21.7 and −21.9 LUFS respectively, with true peaks −9.8 dBFS. User-facing piano+cello and piano+cello+violin short excerpts measure approx. −21.7 LUFS; original piano is not modified. Full WAVs have approx. −22.4 LUFS integrated and −4.7 dBFS true peak.

## Tests and build receipts

10 focused local Python regressions **passed** using the actual downloaded 12-source bank and frozen piano; tests include original piano hash, explicit rejection of tampered source bits/piano changes, actual f0 and periodicity of the four admitted sources, original bow tail rising above its own end, unaltered note attack after click guard, natural release not being identical to arbitrary fading, and exact solo-piano intro/outro regions. These are *local* tests only, not remote CI proof of this V6 renderer. Do not attribute these 10 tests to GitHub Actions.

The rendered V6 self-contained local study archive (not pushed to GitHub) is `Evercraft_The_Last_Light_V6_Instrument_Foundry_Study.zip`, SHA-256 `cb001e26d1287321b58cc591a3763e392ba4d2de06ae5c9cc5c27310ec8dc97a`. Its `SOURCE_PITCH_RELEASE_PROVENANCE.json` includes complete source SHA-256 values, per-note source release span and gain, output hashes and encoded MP3 measurements. Original piano WAV is bundled byte-for-byte, along with local renderer and tests.

## Non-negotiable instrument development gates

1. Have founder listen to isolated original cello and violin recordings *without added reverberation* and reject any tone that already sounds bad. Do not EQ a low-quality sample to conceal its inadequacy.
2. Compare generic and natural recorded release on matched passages. Neither passes by virtue of math alone.
3. For world-class, legally usable original Evercraft instrument technology, **record or license** real legato transition phrases (cello E3↔G3, C3↔G3; violin E4↔G4) and separate bow-direction, bow-off and alternate-dynamic performances; preserve the original raw WAVs, performers and permissions.
4. Build a discrete captured-articulation state machine, not a claim that overlapping independent note recordings constitutes a live musician.
5. Preserve close/room microphone recordings and full real dynamic layers at acquisition. Build the piano's next-generation pedal and sympathetic-resonance sibling as a separate opt-in source, with no mutation of the founder-approved piano.
6. Do not expand to a full orchestra until individual violin and cello tones, phrase transitions, counter-melody and final human listening tests pass. V6 **remains unapproved**.

**Rights:** VSCO 2 Community Edition source samples are CC0 but were not originally recorded by Evercraft. Do not claim exclusive ownership. Original Steinway samples were recorded through the University of Iowa collection. A fully Evercraft-owned commercial orchestral sampler needs original performed takes and documentation.
