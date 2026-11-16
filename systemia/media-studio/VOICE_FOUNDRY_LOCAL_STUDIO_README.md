# Evercraft Voice Foundry | Local Private Studio v0.1

**State:** prototype in draft PR #1667, review-only. No public domain, no phone access, no external network endpoint, no customer launch. **Bella V05 remains protected.**

## What this actually does

The local studio gives the Evercraft workstation a responsive white/black/red web interface with:
- Four verified frontend locale options: American English (`en-US`), British English (`en-GB`), Spanish (`es-ES`, regional accent unverified), Brazilian Portuguese (`pt-BR`).
- Eight existing model voices and four two-stock-pack derived blends, all clearly labeled experimental or stock.
- Paste an original script (20–1500 characters), choose a voice, generate dry PCM WAV plus a private listening MP3.
- A bounded 1-worker rendering queue, job status, playback, downloads and recorded SHA-256 provenance.
- Server listens at **127.0.0.1 only**, rejects nonlocal clients, foreign browser Origin, missing secret browser token and invalid JSON. It never accepts remote URL input, file paths or arbitrary command arguments from browser submissions.
- Default review files are held in `~/.local/share/evercraft/voice-foundry/reviews/` with separate secure job IDs; text inputs are removed after processing. Final evidence contains the script as intended; recordings persist until the operator removes them. Never assume automatic expiry.
- Every generated artifact is checked against the original workstation SHA-256 receipt before preview/download.

This **does not** synthesize Bella V05, clone living speakers, train a novel voice model, establish native language quality, or authorize any commercial/public voice release. The local server requires the owning operator's machine access and is not designed for multiple remote users.

## Start on Penguin/Node001 (operator action required)

Kokoro and FFmpeg must already be installed in the *same Python environment*. Do not reinstall a conflicting system Python globally. These are indicative prerequisite checks:

```bash
python3 -c 'import kokoro, soundfile, torch; print("Native voice libraries present")'
ffmpeg -version | head -1
espeak-ng --version | head -1
```

From a checked-out copy of the branch `feature/bella-actor-lab-20261026`, not a production release:

```bash
python3 systemia/media-studio/voice-foundry-local-studio.py --check-only
python3 systemia/media-studio/voice-foundry-local-studio.py --port 8766
```

Open **http://127.0.0.1:8766** in a browser **on that same computer**. The interface is intentionally unreachable on a separate iPhone, even while on home Wi-Fi. Stop the server with Ctrl+C. Do not start it as an internet-facing Systemia edge application, open a router port, or reverse-proxy it until dedicated authentication and security testing exist.

If dependencies are absent, install them only in a separate reviewed virtual environment, following the Kokoro documentation for compatible torch, language phonemizer and libsndfile dependencies; rerun native test renders. The studio automatically invokes `voice-foundry-workstation.py` using the currently running Python executable. First render may need access to published model weights; this is not guaranteed fully offline until weights are pre-cached and vendored/verified in the approved Evercraft artifact store.

## API surface, private only

- `GET /` mobile-friendly studio UI, CSP nonce and per-launch CSRF token
- `GET /healthz` local private state only
- `GET /api/voices` approved-experiment catalog and language sample copy
- `POST /api/render` only `{"voice":"ef_dora","script":"..."}` from same-origin UI
- `GET /api/jobs/<opaque-job-id>` private status, opaque IDs required
- `GET /api/jobs/<opaque-job-id>/preview.mp3` / `native.wav` / `evidence.json` with receipt validation before audio playback

No CORS exemptions. No public-key handshake. No account sessions. No remote-access trust assumption. This is a local-only operator workstation.

## Privacy and release limits

Only use scripts for which Evercraft has rights. All generated audio is **private-review only** with `productionReady = false`, `releaseAuthorized = false`, `humanPronunciationApproved = false`. Existing stock voice packs and their blends aren't proprietary independently trained voice models. Regional Spanish and Portuguese pronunciation must be checked by a competent language reviewer before customer use. Research the applicable model/voice weight licenses and third-party dependencies before commercialization.

## Next stage

1. Verify this UI and request pipeline in the CI local integration suite, including rejecting cross-origin and tampered files.
2. Execute on an Evercraft-owned test node with Kokoro, using an original short Spanish script, then use the browser audio player and compare it with the direct CLI WAV.
3. Add a private review scorecard with exact-word/timecode defects and native-speaker pronunciation ratings.
4. Only then design a **new, separately authenticated, TLS-protected owned mobile edge**, with per-user access, queue limits, rate limits, data retention, and no default public sharing.

**Do not claim phone access or a deployed customer site from this repository-only commit.**
