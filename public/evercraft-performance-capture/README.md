# Evercraft Performance Capture RC02

**Status: Local performance-capture prototype, not approved music.**

A no-cloud browser recorder for genuine piano performances. Works with a hardware MIDI input where Web MIDI is supported or microphone audio in an HTTPS/localhost context. Touch keyboard is diagnostic and is not a substitute for a weighted piano. Export a raw JSON event history, industry-standard MIDI file with pedal CC64, and optionally a directly recorded microphone WAV.

## Improvements from RC01

- Preserves the incoming hardware MIDI `receivedTime` rather than the time at which JavaScript handled the event.
- Closes every still-held MIDI note and depressed sustain pedal on Stop, preventing unusable hanging notes from entering exported MIDI.
- Handles multiple simultaneous notes and MIDI input devices, keeping source and channel identity.
- Labels keyboard-touch diagnostic performances separately from hardware input.
- Real-time capture is limited to 90 seconds, with no network upload.

## Replay a *human* take using recorded CC0 upright-piano samples

`python -m pip install numpy scipy soundfile`

`python render_human_take.py evercraft-human-take.json --output-dir ./my-performance`

Renderer consumes the actual exported note onset, release, velocities, and sustain CC64. It uses *recorded* piano samples from Meta Open Sound at a pinned git commit, records each sample hash and take hash, and writes WAV. It **does not invent musical notes** or claim to be a microphone recording of an instrument. The microphone WAV from the actual performance is the strongest direct source when available. Both capture and sample replay are unapproved for publishing.

Source: https://github.com/facebookincubator/Meta-open-sound/tree/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-piano (CC0 1.0).

### Browser caveats

The microphone requires a secure origin (HTTPS or localhost). Web MIDI is available primarily in desktop Chromium browsers; iOS Safari does not generally expose Web MIDI. Save/download your exports before closing the page. Do not record another person without permission.

## Desktop launch

Mac/Chromebook Linux: `bash start_local_mac_linux.sh` then open `http://localhost:8765/index.html` in Chrome. Windows: double-click `start_local_windows.bat`, then open the same local URL. **The server binds to 127.0.0.1 and does not expose the recorder publicly.** Chrome/Edge desktop may support Web MIDI; phone browsers generally will not. A real piano/keyboard or recorded microphone performance is needed to create meaningful commercial music. The built-in touch keys record input events but do not generate sound.

No genuine performance recording is bundled with this lab. The included QA fixtures simulate note events for engineering tests and are not artistic performances. The render script uses a recorded CC0 sample library for replay; playback is not equivalent to a live microphone recording and does not grant publishing rights to third-party material in a final commercial.