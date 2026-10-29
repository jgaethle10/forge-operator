# Evercraft LIVE | Real Media Producer (RC10)

**Purpose:** Put actual original Evercraft visual outputs on a clean full-screen stage for founder review and capture, not another synthetic activity dashboard.

Open `/forge-operator/live/producer.html` after publishing. Select a local MP4, WebM, PNG, JPG or WebP, or drag files into the stage. The page creates local browser blob URLs, plays the queue, loops to the next source, and offers Hold/Pause, 9:16 via device orientation, original sound muted by default, contain/cover framing, and Film Mode. On mobile, Exit Film remains touch-accessible. The operator can screen-record the stage in a supported tool. No website login or provider account is necessary.

## Boundaries

- **No upload**: No fetch, network calls, local storage, or public media publication. The page itself is hosted publicly, but each file selected into a browser is local and not visible to other visitors. The source queue clears on navigation/reload. Drag-and-drop from a supported local filesystem is operator initiated.
- **No approval inference**: Loading an asset into the producer does not constitute rights, music, identity, minors, customer privacy, or release clearance. The stage retains a LOCAL REVIEW watermark. Publishing/streaming still requires the existing signed RC04 public release gate and authorized editorial workflow.
- **No 24/7 TikTok claim**: An open tab on the founder's desktop is not a resilient server-side encoder and cannot run indefinitely after machine shutdown. The public portal and producer may load 24/7, but the local clip queue does not persist.
- **Real media only**: This player contains no pretend worker animation, static demo footage, generated scene, or fabricated metrics. Until an actual file is supplied, the stage displays an honest empty slate.
- **No third-party dependencies**: Pure HTML/CSS/JS hosted in Evercraft's existing GitHub Pages fallback. No Base44, TinyFish, paid rendering, or third-party video service.

## Review/capture procedure

1. Confirm the clip is Evercraft-origin material with rights to image, voice, music and any identifiable people. Never place private work or family images on a shared screen.
2. Open the studio page on the recording computer, import the original source file(s).
3. Preview them in normal mode. Inspect content, timing, color, text, sensitive areas, background sound, and camera framing.
4. Leave sound Muted unless audio ownership is verified. Enter Film Mode; the source filename and operator controls disappear.
5. Capture through your local screen-recording workflow. This is a local review recording only. Do not livestream merely because a file plays.
6. For a public scene, pass the verified media and provenance through the canonical Systemia/RC04 signed-release process. No auto-publication or new human gate has been invented here; it reuses the existing one.

## Next meaningful engineering step

Attach the signed, privacy-cleared public artifact feed from draft PR #1298 after its release security review. Feed actual mp4/webm sources to an owned resilient broadcast director. No raw private Systemia data or unreviewed media should be requested by a public client.

## Quality gate

`node --test tests/evercraft-live-producer.test.mjs` plus public mobile checks, source audit and external hosted URL readback after merge.
