# Fallen commercial audio preflight

This is an **independent post-export gate** for short client commercials. It measures the exact finished media bytes, rather than assuming the timeline's mastering settings produced the expected result.

## Use

```bash
node systemia/media-studio/commercial-audio-qc.mjs ./exports/customer-30s.mp4 ./receipts/customer-audio-qc.json
node --test systemia/media-studio/commercial-audio-qc.test.mjs
```

Requires installed `ffmpeg` and `ffprobe`. Exit code `0` means *audio technical preflight passed*, `2` means rejected, and `1` means inspection failed. JSON includes master SHA-256, input integrated loudness (LUFS), input true peak (dBTP), loudness range, channel count, source-probe references, decision and reasons.

The default provisional **short commercial** policy is integrated loudness from **-19 to -12 LUFS**, true peak **at or below -1 dBTP**, and **mono or stereo**. These values are intentionally conservative starting points, **not** universal platform guarantees. An operator may provide documented policy overrides programmatically when delivery requirements differ.

## Production sequence

1. Obtain written client brief and authorized media references, including likeness/music rights. No client order or paid generation is authorized by this gate.
2. Build the storyboard, scripts, original/supplied imagery and dialogue/music/sound mix through Fallen. Check speech pronunciation and intelligibility by ear.
3. Render the agreed format, then run Fallen `assessStudioMaster` for duration, codec, resolution, freezes, black frames and silence.
4. Run **this** audio preflight against **the same final MP4** and preserve the two independent receipts with matching master hashes.
5. Require visual/creative review, actual rights reconciliation, client approval, and the existing delivery and publication gates. No automatic posting or charging.

The audio gate does not establish voice naturalness, lip sync, lyric/music licensing, footage or model rights, accessibility, creative merit, conversion performance, or channel-specific platform compliance. It must **never** be used as the sole release authority.

## Known limits

FFmpeg's `loudnorm` JSON measurements are extracted from its input-analysis pass. Extremely short programs and near-silence may yield non-finite output. These **fail closed** rather than being treated as an acceptable mix. More than one audio stream is rejected pending explicit review instead of selecting a track silently.

`commercial-audio-qc.mjs` currently runs as an **opt-in preflight**. It has not been wired into the canonical studio delivery action; do not describe it as automatically enforced at export or shipment until that integration has its own evidence and tests.
