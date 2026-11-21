# Fallen Studios — original music reset / owner A-B audition
**2026-10-28 · PRIVATE / NOT RELEASE APPROVED**

## Decision
The previously delivered 30-second `Build What's Next` video **and original underscore** were explicitly rejected by the owner. Do not reuse or publish the commercial. Do not describe a technical export as a successful commercial.

### Measured weaknesses in the original soundtrack
The legacy `score.py` in the original source ZIP was an evenly pulsed oscillator arrangement: repetitive block chords, thumps on almost every beat, filtered random-noise swells, and a repeated loop-like 3.7-second harmonic sequence. The assembled commercial audio measured **-16.0 LUFS integrated, 1.4 LU loudness range**, and -1.5 dBFS true peak. This does **not** establish the only cause of its poor quality, but it exposes the nearly unchanging dynamics.

## Actual new media produced
**Original working title:** `A System in Motion`. **Length:** 30 seconds. **Source:** original, deterministic Python sound synthesis; no sampled instruments, stock recordings, or SoundFonts. Renders at 44.1 kHz PCM WAV, with 192 kbps stereo AAC mobile audition copies.

Two **newly rendered** alternate treatments, not just level-adjusted copies:
- **A / Human Pulse:** more restrained modal-felt-key and acoustic strings modeling; weaker rhythm, more room and softness; measured **-15.4 LUFS, 7.7 LU range, -1.7 dBFS true peak**
- **B / Forward Motion:** same musical signature with stronger bass/tuned pulse/physical accents; measured **-14.3 LUFS, 8.1 LU range, -1.7 dBFS true peak**

### Cue architecture
- 0–6 sec: fragile three-note identity, near-silence and tactile piano decay
- 6–12 sec: harmonic movement, lightly introduced pulse
- 12–18 sec: bowed overtones, controlled propulsion
- 18–24 sec: melody expands without aggressive trailer-impact percussion
- 24–30 sec: allow space and resolve into human scale

The synthesis engine creates its own harmonic piano/modal-strings, bass, tuned percussion, filtered sound-design transients, and room impulse response. It exports **six editable stems**: keys, strings, bass, pulse, foley, and air. These timbres remain synthetic; do not claim they're real musicians or recordings. Importantly, loudness-range improvements are **not a human aesthetic approval**.

### Evidence / preservation
- [Private original score archive](https://drive.google.com/drive/folders/1pQdAXo5pKaXWA_aRRcYAmLlLL6KLct7O)
- [A M4A audition](https://drive.google.com/file/d/1tPNLzugDUlZyvTIqr-ooZTA3vo0Pf_KP/view?usp=drivesdk)
- [B M4A audition](https://drive.google.com/file/d/11xBdhY1AG3R4L5WkC0QLFngeG5_KiUt0/view?usp=drivesdk)
- [Editable engine, PCM masters, all stems, source manifest](https://drive.google.com/file/d/1vfP5eqyBHwuZSxRGbfTkIUyiYJjwb9GQ/view?usp=drivesdk)
- [QA and limitations](https://drive.google.com/file/d/1Ko7tlEtCnB5rVu1Lf_y1wEVQb0F--Cf2/view?usp=drivesdk)
- A/B sent privately to owner in Gmail message `1a185c88c8591a99`; both file attachments verified. Not sent to clients.

### Gates
1. **Owner listens** to both on headphones **and a phone speaker**. No score approval without this.
2. Judge the *music*, not merely LUFS: melody memorability, harmony, believable sound, emotional turn, mood/story relevance. Hard veto for cheap MIDI-like timbre.
3. Review with **real commercial picture**; never take an owner's audio preference as proof the rejected film has become good.
4. Replace synthetic sources with verified licensed and/or company-owned acoustic recordings if physical modeling isn't convincing.
5. Release only with actual correct Evercraft brand assets, truthful footage, and separately tested recipient playback.
6. **Vast GPU spend $0**; no approval for public publication.

**Current status:** produced, exported, iPhone-compatible format checked by decoder, human aesthetic approval / real-device playback pending.
