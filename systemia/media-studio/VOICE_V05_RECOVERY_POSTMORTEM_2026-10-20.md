# Voice Foundry: V05 Failed Phoneme Edits | Audio Evidence Postmortem

**2026-10-20, engineering correction.** Owner's verdict on V05 stress-vowel experimentation: 'That didn't work at all'. Keep Kokoro af_bella V05 as the preferred voice **from the original successful shootout**. No later experimental pronunciation is approved. The goal is believable cadence without harming the original timbre.

## Actual generation path confound

- The original first-choice V05 WAV came from the real Piper-vs-Kokoro shootout (`voice-model-shootout-ci.py`), which renders Kokoro through the normal `KPipeline(text,voice='af_bella',speed=1.0)` call. Source action run: https://github.com/jgaethle10/forge-operator/actions/runs/39464600851
- The later 'model_original' control in `voice-v05-brand-stress-lab.py` calls `generate_from_tokens(g2p(text).tokens,voice='af_bella',speed=1.0)`, which is a different synthesis API even with unaltered words. **This was a confounding design mistake** if we wanted to compare directly to the founder's preferred original.
- `voice-v05-native-parity.py` runs the original native route twice plus an unmodified G2P token route on the same scripts, with an explicit repeat seed and per-take audio digests, so we can measure source-path differences before changing a phoneme again.

## Byte-level recovered audio audit, NOT a subjective acting metric

Using actual archived WAV audio from the first real shootout artifact and the later stress-vowel artifact, not guessed waveform data:

| Candidate compared with archived original V05 | WAV SHA-256 (prefix) | Duration (s) | Zero-shift Pearson correlation | Best abs normalized correlation with ≤0.2 s lag |
|---|---|---:|---:|---:|
| Original V05 | `eac576dc30d5a5e6` | 3.725 | 1.0000 | 1.0000 |
| Later unmodified token-route original | `660b1af99b0842a2` | 3.725 | 0.9978 | 0.9978 |
| Alternative /ɑ/ vowel, original stress | `0284c2eaebec9a3d` | 3.725 | 0.6277 | 0.6863 |
| Shift primary stress to EVER | `5743692954b7d78b` | 3.650 | 0.0043 | 0.3071 |
| Relax CRAFT stress | `e9eebdd2c0f647a4` | 3.650 | 0.0444 | 0.2897 |

Measurement method: decode both archived mono 16-bit 24 kHz WAVs; compare Pearson on the shared leading PCM frames; use FFT-based normalized cross correlation over full signals with allowed absolute time shift up to 4,800 samples (0.2 s). Duration shifts, dynamic timing, syllable alignment or different F0 can lower correlation, **even if human listeners find audio acceptable**. Correlations are source-output similarity, never MOS, naturalness, word correctness, accent or preference scores. These measurements cannot establish that an alternate API alone caused the user's dissatisfaction: **the unedited source routes are almost identical for this input**. The aggressive IPA stress edits were associated with much larger waveform differences, consistent with but not proving the listener's complaint.

Confirmed source phonemes at 'Evercraft': `ˌɛvəɹkɹˈæft`. Attempting to move primary stress or use /ɑ/ is not justified by the founder's observation alone. A subjective robotic-vowel impression need not mean the dictionary vowel is wrong.

## Immediate corrective standards

1. **Use the native `KPipeline(text)` route for all new first-choice V05 production-direction demos.** A raw-token route is diagnostic-only unless its independent listening output is approved. Do not inherit 'approved' from the presence of a model, code test or SHA receipt.
2. Keep the exact original V05 golden-reference dry WAV fingerprint `eac576dc30d5a5e684241de1e7bd187b5f6d3d0f00d39eb413c31255eeb33a14`, speaking 'This is Evercraft, and this is only the beginning.' Avoid accidentally relabeling later 'original' token-route WAVs as it.
3. The failed edited-stress and edited-vowel samples remain private negative experiments. **No auto-lexicon promotion.** Qualified actor/phonetics/dialect listening should diagnose coarticulation and pitch movements before future brand phoneme edits.
4. Blind-listen to original native vs unchanged-token route before causal assertions. Test seeded native repeatability. If both are nearly the same, do not waste more effort on the API switch; instead evaluate true model expressive capacity with real human references and meaningful scripts.
5. **No publication, production, voice rights, model provenance or commercial licensing approval** has been conferred. PR #1465 remains draft.

Portable user listening/verification artifact created outside the source repo: `Evercraft_V05_Recovery_Golden_Baseline.zip` contains authentic recovered original V05 WAV/MP3, unmodified token-route WAV/MP3, altered test WAVs for fingerprint comparison, `audio-comparison-evidence.json`, and a two-take HTML player. The original model weights were not rehosted.

Founder/team learning: 'a changed waveform' is not a better actor. Preserve a beloved performance first, then test one variable at a time against a genuine golden reference.

## Controlled source-path parity: experimental result

Dedicated real Kokoro 0.9.4 CPU GitHub Actions test PASSED at https://github.com/jgaethle10/forge-operator/actions/runs/39524633121 (artifact `evercraft-v05-original-pipeline-recovery`, artifact ID `12313365675`). The script `voice-v05-native-parity.py` seeded torch and NumPy to 1701 separately before native, repeated native, and untouched G2P token synthesis for each scene.

| Script context | Native re-run PCM identical? | Unchanged token-route PCM identical to native? | Dry WAV duration |
|---|---|---|---:|
| tagline | YES | YES | 3.725 s |
| brand | YES | YES | 4.275 s |
| promise | YES | YES | 4.525 s |

All nine dry WAV SHA-256 values and nine listening MP3 SHA-256 values match the uploaded artifact report, verified independently after download. This **falsifies** the working hypothesis that a different source API necessarily degraded output for these input texts, model and seed. It remains a valid testing control for future code.

**Revised conclusion:** the degraded founder-rejected samples were generated with changed brand-name phonemes, and the unchanged source routes are identical under a controlled repeat. Editing vowel and syllable emphasis is therefore the much more relevant experimental difference. This does NOT prove the IPA edits were the only source of perceived robotic sound, nor that any specific alteration is a correct pronunciation. The legitimate original V05 sound stays our baseline.

**Do not run random seed-search as a default 'voice fix':** the same seed reproduced an identical PCM stream in the control; cross-seed diversity has not been evaluated. More meaningful performance gains are likely to require real expressive conditioning or another capable synthesis architecture with independently licensed voice assets, human performance reference and a carefully designed listening evaluation. Do not claim a human-quality improvement without that evidence.

Outstanding: model checkpoint digests/voice licensing and independent authorized recording; casting and final founder publication remain held.
