# Cello audition for Evercraft Web

**NOT for release.** First positive music response on Oct 20: founder said both 17.6-second real recorded Meta Piano auditions sounded "pretty good." This does not mean final approval.

We preserve the positive source WAVs as SHA-verified, byte-identical reference masters. We generate two independent new comparison versions by layering only recorded bowed cello samples:

- **Subtle** = exact close piano + a soft, mostly sparse bowed solo-cello root line.
- **Intimate** = exact room piano + a slightly more present solo cello.
- No fake string ensemble, synthesized pads, risers, extra music, voice, generated loops, or mastering limiter.
- Cello sound source: Karoryfer x bigcat Cello, CC0 1.0, recorded by Kamila Borowiak, source pinned to 6fd75fbfc1dbb3109bf26220ba1adea46188a18b.
- Source notes get safe neighboring-semitone resampling rather than pretending a completely synthesized section is recorded. Bow samples are naturally time-limited and left to decay. See `proof.json` for actual sample hashes.
- Production acceptance still requires independent human audition of both takes, explicit rights metadata, and an approved real product video. GitHub runner is not production service deployment.

Run `python systemia/clip/evercraft-web-recorded-cello-audition.py` from repository root with `numpy, scipy, soundfile`.
