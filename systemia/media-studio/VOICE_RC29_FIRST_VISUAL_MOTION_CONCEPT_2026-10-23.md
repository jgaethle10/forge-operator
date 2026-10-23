# Evercraft Voice Foundry RC29 | First rendered moving-picture study

Date: 2026-10-23. Status: PRIVATE VISUAL DEVELOPMENT, not an Evercraft software demonstration, production ad, or cleared public release.

## Progress after RC28

An actual 15.05-second, 24-fps **animated moving-picture MP4** was created with the literal female Heart narration and procedural score of the RC28 `visual_first-heart` cut. This goes beyond the previous audio-only studies. The RC28 scored preview is the audio source, never substituted with Chatterbox, with no new text or regenerated voice.

- 16:9 source MP4: 1280×720, H.264 + stereo AAC; 361 video frames; 15.050 seconds; SHA-256 `9af535d5cf62cc6e40b0512fdb9ef349573be9b51a24cc44af0dd5e491858202`.
- 9:16 phone/review reframe MP4: 720×1280, H.264 + stereo AAC; 361 video frames; 15.061 seconds. This is a framed portrait review, not an independently directed native portrait commercial.
- Audio QC of the final landscape MP4: -16.0 LUFS integrated, -1.8 dBTP true peak, 48-kHz AAC stereo.
- All visual art is rendered in code through NumPy/Pillow as procedural motion, with no stock media or actual product capture. It includes a moving spark that symbolizes inspiration, a mounting pile of six fictional abstract work windows, a return to visual clarity, and an EVERCRAFT branded ending.
- Both previews clearly watermark "RC29 · VISUAL CONCEPT · NOT A PRODUCT DEMO" or "PRIVATE CONCEPT - NOT A PRODUCT DEMO." No one should mistake the fictional mock windows for actual Evercraft functionality.
- The release studio contains the two real MP4s, complete source renderer, separate vertical-reframe FFmpeg recipe, original RC28 MP3, six frame stills and two contact/portrait review images, actual media QA, SHA-256 receipts and an honest shot list.

## Portable studio and integrity

User-facing sandbox attachment generated in the current turn (not a durable public URL): `Evercraft_RC29_Visual_Proof_Studio.zip`. SHA-256 `1cd26f58516de51023230b821566c60704cca90181267672a34eb77efdd7a134`. Verified ZIP CRC integrity and 18 total packaged entries. Complete local renderer is in `Evercraft_RC29_Visual_Proof/source/render_rc29.py` inside this private ZIP. The renderer is **bundled in the artifact**, not committed as source to the repository by this markdown-only receipt.

Reproduction command (within the unpacked package):
```bash
python source/render_rc29.py --audio source/RC28_original_scored_Heart_reference.mp3 --output RC29_Concept_16x9_720p.mp4
```
Dependencies: Python 3.11+, Pillow, numpy, Inter or supported fallback font, FFmpeg. The original RC28 music and speech are not newly created or relicensed by the video process. Intermediate decoding/encoding into AAC is not bit-identical to the original MP3 source; its content/text is unchanged.

## Shot and temporal plan

| Time (s) | What is actually shown | Evidence state |
| --- | --- | --- |
| 0.00–2.25 | One procedural glowing vector 'idea' stroke | Invented concept visual, original generated art |
| 2.25–5.8 | Six separate conceptual work windows begin appearing | Fictional dramatization, not product/customer footage |
| 5.8–8.9 | Six-tab clutter and frustration, then fade | Conceptual representation of copy |
| 8.9–12.6 | Clean quiet stage, making-first sentiment | Creative positioning, not proven software capability |
| 12.6–15.05 | Provisional EVERCRAFT end identity and tagline | Not a validated customer CTA or working sales link |

## Required next genuine production advancement

1. Founder review: determine whether the motion treatment and score are appealing or still too templated/graphic-heavy. The user has not rated RC29.
2. Decide whether the ad sells Evercraft broadly, a specific working Systemia feature, or Voice Foundry as a commercial production service. Do not conflate multiple offers.
3. Replace generic animated windows with **real, rights-cleared** footage and verified product-screen recording, with sensitive data redacted. Only then claim a particular benefit to buyers.
4. Obtain a real landing/checkout URL, end card, captions and mobile-safe proof; validate all source and model/voice rights, publication permissions and final founder approval.
5. Retain Clip as the future publisher, but NO publishing instruction, upload, or release receipt exists for RC29.

## Governance

RC29 is an explicit exploratory proof-of-concept, not a product launch, final picture lock, licensed voice-casting sign-off, verified marketing claim, or proof of ability to deliver proprietary film-making tooling at commercial scale. Never describe the synthetic mock screens as filmed, functioning Evercraft software. Draft PR #1465 remains draft/unmerged. The complete standalone studio ZIP is separately attached to the conversation, and not uploaded to Drive by this GitHub documentation write.
