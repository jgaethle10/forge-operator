# THE LAST LIGHT | Orchestra and Piano Foundry

## Canonical artistic direction (founder approved the piano sound, not the orchestra)

The founder listened to **The Last Light** (October 21, 2026) and said: "Holy fuck fam I love it. Let’s engineer a full orchestra around that piano sound. We need to further develop the piano itself as well but that’s the song I want to start with."

**Immutable piano baseline:** exact 35-second stereo PCM24 file SHA-256 `630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e`. Do not modify the original or replace it in place. Every experiment must ship a separately isolated byte-identical piano track and explain any mix-only transformation. The independently reconstructed GitHub WAV is sonically near-equivalent, but a different byte fingerprint; **do not call that exact same reference**.

## First actual orchestration workprint

Locally rendered and supplied for founder audition as **35s Intimate** and **35s Cinematic**, with 7 individual scored orchestral parts and all parts as 44.1kHz PCM24 stems, plus the unchanged piano and an optional explicitly synthesized early-reflection room-air stem. These are *software-performed individual recorded notes*, **not a performed orchestral ensemble**. Founder has **not** accepted or rejected the orchestral mixes yet.

### Movement architecture

- 0–6.6 seconds: protected Steinway piano alone, melody/question intact.
- 6.6–15.5 seconds: cello lays a counterstatement, violin joins without doubling the piano's every note.
- 15.5–18.5 seconds: violin II, bassoon, bass change the harmonic weight of the C-major color.
- 18.5–23.8 seconds: first emotional apex, real recorded horn and flute plus deep strings; short, non-obligatory climax, no overly emphatic trailer hit.
- 24–35 seconds: instruments gradually relinquish melody and close on the piano.
- Intimate version omits heavy horn/wind/bass in favor of violin and cello.
- Cinematic version keeps all seven instrument parts, separated for independent review.

Score source of truth for 35 seconds: `last-light-orchestra-score.json`. Recorded samples and their independently SHA-256 verified source bytes are captured as GitHub workflow artifacts and in the local listening-kit custody receipt; a short-lived artifact is **not** a durable sample registry.

### Source tracking (exact downloaded University of Iowa mono AIFF scale bytes)

University of Iowa Electronic Music Studios' published terms say its samples may be used in projects without restrictions: https://theremin.music.uiowa.edu/MIS.html . This does not mean the recorded instruments are Evercraft-exclusive or that a live ensemble was hired.

| Source role | Original AIFF SHA-256 |
|---|---|
| violin_pp | `3c69ca7e2a3126ec237d3a9eadf40dde4b75fdef69ca3929d53b25e55a4363c4` |
| violin_mf | `67fa9c3e3c7b4b14cf94fe9eb5bb9d0be9a40a154f9a4aadb412beccaa7e8bd5` |
| viola_pp (held) | `3121bc3ce5e5d3ce098dc4749624c477694e632fb9abc7fd1fb75276a9b4d656` |
| cello_pp | `c680d6e03a1c58457969f98fb7fdf7c6ff16e2539b1b7c2d8d847cbd8a539d20` |
| cello_mf | `e2379d142389870e9e2590ea18b4b4d3597dfa99f079ddc37761520bbf6e1dd7` |
| double_bass_pp_low | `c4542e2b89acea35ac67245d3e2a20a2c3f01d334adf474282be930e7e349a49` |
| double_bass_pp_mid | `5a8348cdbf19e6d8bee78fdffcaf53cdb9947ea3249a59d2e8665294b8347e26` |
| flute_pp | `3e74ab860764d8bb7115b1b64c660be47dfe4a6d75d7b121c5c6962fb1847031` |
| french_horn_pp | `8ad2790b8852ca3b39d58853a9bf0e1218bfe2b0543b9d98e6663211fc3bc48b` |
| bassoon_pp | `a6c4404661284e85a4977ba6217979914c918482c7214345f44ddddc7984a653` |

11? There are **10** recorded source scale files including held source. File hashes should be checked on every run; mismatches fail closed. The orchestral source fetch job completed successfully on [run 39646211653](https://github.com/jgaethle10/forge-operator/actions/runs/39646211653) and its instrument samples were also exported in the founder's audition kit.

### Sound-quality limitations

- A scale AIFF encodes notes consecutively, **not** a playable ensemble. Individual notes must be correctly segmented and their pitch independently validated; in pilot 32 scored note events, used cello index mappings and harmonics were corrected rather than assuming every source file includes all printed note names.
- The first viola pianissimo sample's pitch boundary inference could not be verified reliably; held from both audible orchestra versions. Never simply relabel it.
- Piano is a 31-event recording-based programmed performance, not a human keyboard take. Sustain/pedal are approximate; no complex sympathetic coupling or pedal-up/down actual recordings have been gathered.
- Software early reflections are a room **effect**, not a real hall convolution recording; preserve dry stems.
- Avoid pretending individual note samples form actual section playing or multiple human violinists; effective orchestra realization later requires properly documented multi-performer section takes and rehearsed dynamics.
- No commercial master approved; draft PR only. Original user's `The Weight of Silence` recording remains untouched as the separate older reference.

## Piano Foundry V3 engineering program

1. Retain V1 as the exact founder-approved benchmark, with an instant bypass and a meaningful A/B at equal loudness.
2. Record or source **pedal-up and pedal-down** piano takes, in actual soft / medium / forte layers, with staccato, key release and hammer/damper behavior, using performer and recording-rights receipts.
3. Implement velocity-specific *timbre*, not merely amplitude; independent round-robin on repeated notes, proper key-off and pedal release; never infer sample layers the recordings do not contain.
4. Add reversible partial sympathetic resonance from true recordings or clearly marked physical model. Keep added room as an independent aux stem and avoid blanket long reverb.
5. Unit-test polyphony, exact WAV SHA-256, loudness/true-peak, phase, voice cutoff and pedal transitions. Final proof requires actual human headphones/speakers audition, not just green CI.

## Full orchestral destination

Expand beyond this **seven-part chamber-sized mockup** into separately scored first/second violin, viola, cello, bass, piccolo/flute, oboe/clarinet/bassoon, horns, optional restrained trumpet/trombone, percussion/timpani and occasional mallet coloration only when demanded by the musical arc. Record section-style dynamics or obtain documented live/section samples; no invented sample ownership or claims of a commissioned live ensemble. Develop a 2–3 minute three-act score from this 35-second theme **only after the founder chooses the orchestral direction**. Do not force a larger arrangement before listening reveals what to keep.
