# Evercraft Performance Capture, research build 01

This is a **local-only human performance capture tool** to replace failed programmatic soundtrack generation with real timing, phrasing, pedal events, and microphone audio. Download the single-page `index.html` and open it over HTTPS/localhost for microphone recording. Desktop Chrome/Edge can also use Web MIDI; mobile devices may have microphone capture but not Web MIDI. It does not upload captured audio or event histories.

**Tested:** Chromium headless: start recording with microphone deselected, tap C4 key, stop, download MIDI. Produced a readable standard MIDI file with header `MThd`, note on/off events, 480 PPQ and 120 BPM timeline reference. **Not yet independently tested:** actual microphone hardware and physical MIDI keyboard; headless sandbox microphone unavailable. Treat as proof of local UI/MIDI flow, not full live instrument acceptance.

## Benchmark licensing

`benchmark.py` fetches a 13.5-second source segment of Laurens Goedhart's *Clair de lune* rendition, credited as Creative Commons Attribution 3.0 on Wikimedia Commons. Used only as a human-performance comparison to study real touch, rhythm and phrasing. **It is not Evercraft music, not our composition, and not approved for the Evercraft commercial.** File includes source URL, license and modified-excerpt disclosure. Play it as a reference, not in the advertisement.

## Next gate

1. Capture one original 8–12s piano performance through microphone or MIDI, with performing artist rights and actual recorded instrument.
2. Listening test without strings, effects, narration or brand video; record actual artistic feedback.
3. Preserve approved raw performance and its performance metadata and connect it to Fallen.
4. Only then arrange cello, and only if a real expressive player takes the part.
5. Commercial launch separately requires verified public Evercraft Web customer path.