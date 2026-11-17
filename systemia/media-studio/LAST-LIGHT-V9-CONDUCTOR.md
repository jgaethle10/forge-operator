# Fallen Music | Orchestral Conductor V9

**Status: engineering score study, not a finished orchestral recording.**

This adds a separate 14-part orchestral *rehearsal* score (47 original proposed events) around **The Last Light**. The founder-approved 35-second Steinway piano waveform is **not** included, regenerated, altered, or replaced. Reference SHA-256:
`630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e`.

Run using only Python stdlib:

```bash
python systemia/media-studio/last-light-v9-conductor.py \
  --score systemia/media-studio/last-light-v9-conductor-score.json \
  --out /tmp/last-light-conductor-v9
python -m unittest discover -v -s systemia/media-studio -p 'test_last_light_v9_conductor.py'
```

Outputs: standard MIDI type-1 file (one conductor + fourteen individual instrumental tracks, editable in a DAW/notation program), section timeline JSON for downstream PulseGrid work, plus tamper-evident SHA-256 receipt. Explicit channels, instrument ranges, onset times, section dynamics, note-offs, stage pan, expression CC automation, protected opening/ending and source status. The MIDI program assignments are **notation/rehearsal interchange, not a promise of realistic sound**. No GM or oscillator audio is produced. Importing into a player's GM synth is entirely optional and cannot be used as instrument-quality evidence.

**Acoustic bridge:** The earlier V7/V8 workflow validates **three** real VSCO2 CC0 cello/violin WAV takes and renders limited source-backed stems. Their recordings only partly cover the scored cello/violin material; actual recorded legato phrases, full ensemble section takes, winds, brass, percussion, and musician review are not present. Accordingly every full-section audio stem is blocked. The existing V7/V8 audio renderers, score, piano, and *The Weight of Silence* are untouched. Do not treat MIDI as a released mix, use the unapproved samples for live-orchestra claims, or merge/promote until listening approval.

Next engineering gates: (1) captured/listening-approved performed gesture library with rights, (2) section-note/phrase resolution that fails on missing assets, (3) performance-aligned acoustic stems, then (4) independent auditory approval for counterpoint/timbre before any full-duration orchestral master.
