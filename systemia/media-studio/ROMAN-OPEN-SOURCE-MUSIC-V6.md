# Roman Commercial Music Upgrade V6: Open-Source Audition Lane

**Scope:** Two standalone 30-second commercials for Roman's Icy Tai and Flame & Brew. **State:** integration code and audition briefs only; neither ACE-Step generation nor a new soundtrack is claimed to have run.

## Why we are changing the process
The previous V5 original synthesized scores were technically within social audio specifications, but creative/music quality is not implied by audio loudness. Roman's films need *real musical decisions*, scene-by-scene direction, and three independent candidate cues for each brand. A single synth loop is not an acceptance standard.

## Selected upstream candidates and boundaries
| Upstream | Purpose | License/source | State |
| --- | --- | --- | --- |
| `ace-step/ACE-Step-1.5` | Music generation, instrument timbre, tempo, structure and optional repaint editing | Source LICENSE MIT; Hugging Face Ace-Step1.5 model card MIT as checked 2026-11-16. Review model-specific notices before commercial use. | API contract inspected. **Not installed, loaded, or inferred** by this PR |
| `kajisho5/ffmpeg-skill` | Local editorial tool contracts, reframe, scene handling, audio quality and export check inspiration | MIT | Candidate for sandbox benchmark. **Not installed** by this PR |
| Existing **Fallen Commercial Audio Lab** | Loudness, true peak, subtitles, rights, provenance, QC and Clip handoff | First-party | Existing code, not replaced |

All project source, rights receipts, editing decisions and approvals stay owned in Evercraft/Fallen. No third-party SaaS execution, credential sharing, or outsourced hosting is required. The GitHub code integration works without GitHub after local checkout; GitHub is not the runtime.

## Commands
Generate six distinct audition specifications, three per business. No inference:
```bash
node systemia/media-studio/commercial-music-open-source-bridge.mjs plan ./roman-v6-auditions.json
node --test systemia/media-studio/commercial-music-open-source-bridge.test.mjs
```
Only after a **local** ACE-Step API has been deliberately installed, loaded and started at 127.0.0.1:8001, render ONE audition take at a time:
```bash
node systemia/media-studio/commercial-music-open-source-bridge.mjs generate \
 ./roman-v6-auditions.json roman-icy-tai-organic-funk ./out/icy-organic-funk.wav
node systemia/media-studio/commercial-music-open-source-bridge.mjs inspect ./out/icy-organic-funk.wav
```
Local ACE-Step documents `POST /release_task`, `POST /query_result` and `GET /v1/audio`. The bridge accepts only the loopback origin; the provider-supplied download path must remain on the same origin, and no existing output may be overwritten. There is no automatic client media upload. Each generated file gets a SHA-256 receipt and **remains on hold** pending technical inspection, output rights check, human listening, cue sync, Bella performance, and clip/picture finalization.

## Music direction
**Icy Tai**: 112/116/108 BPM options. Premium, buoyant, natural-sounding bass-and-keys grooves. Hook to accompany cold-plate action, breathing room for scrape/topping sounds, lifting melody at 20-24 seconds, resolved brand hit.

**Flame & Brew**: 96/92/100 BPM options. Warm indie-rock, smoky soul, or cinematic culinary percussion. Space for roaring oven and slicing; richer low end and guitar, with a natural 23-second cheese-pull rise. No generic trailer brass.

## Human selection and mandatory delivery gates
- Each business gets **three independently generated candidate scores** (not variations in gain or speed alone) and one chosen edit. Human listen, reject, and source documentation are required.
- Make picture edits follow music beats; mark real Foley separately from instrumentation. Bella narration must be recorded or delivered with a verifiable authorized voice profile; never represent a drafted line as spoken audio.
- Ensure initial product shots are Roman's actual food wherever possible. Stock footage remains identifiable as stock; don't imply it is Roman's staff or equipment.
- Final 9:16 MP4, plus 16:9 and 1:1 if requested, must pass original Fallen commercial audio/video QC including approved rights and human signoff.
- This PR deliberately does **not** generate songs, publish, deploy models, install dependencies, or substitute the existing approved assets.

## Hardware check before inference
Local Python 3.11/3.12 and adequate hardware/weights are prerequisites for ACE-Step. The 2B variant advertises under-4GB-VRAM modes with offload/quantization, but the XL 4B models need much more VRAM. Check Penguin and NextGen's actual device allocation and memory before selecting any model. **Do not infer owned-node compatibility from an unrelated CPU-only ChatGPT environment.**

## Source contracts
- https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
- https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE
- https://huggingface.co/ACE-Step/Ace-Step1.5
- https://github.com/kajisho5/ffmpeg-skill
- https://github.com/jgaethle10/forge-operator/blob/main/systemia/media-studio/COMMERCIAL-AUDIO-LAB.md
