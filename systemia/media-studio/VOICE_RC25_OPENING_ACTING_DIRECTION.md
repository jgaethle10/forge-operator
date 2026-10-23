# Voice Foundry RC25 | Stop the announcer ramp

Date: 2026-10-21. Founder feedback: "Definitely need to work on the beginning more." This follows RC24 feedback that all six variants of "Ever had an idea you couldn't wait to build?" have an unnatural buildup.

## Diagnosis, not conclusion
The original script #1 is still the founder's favorite *overall concept*, but the opening's delivery is not accepted. Merely varying punctuation, tempo, or inserting "just" in RC24 did not satisfy the founder. The creative model may be the issue: rhetorical question plus TTS default intonation invites unnatural escalation toward "build". The next audition must change dramatic structure rather than claim semantic delight from ordinary Kokoro controls.

## RC25 genuine acting research

Three identical bridge scenes, in two independently cast model architectures:

A: original question, unchanged: "Ever had an idea you couldn't wait to build?"
B: start already imagining: "You get this idea, and suddenly you can see the whole thing in your head. You just want to start."
C: half-spoken realization: "It's that moment when an idea hits and you think, wait, I could actually make this."

Every single-speaker performance continues with exactly: "Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started."

Kokoro branch: af_heart original, 85% Heart/Bella blend, for 6 full recordings. An extra alternate D cold open contains three truly alternating turns: (Michael) "Hold on. I've got an idea." (Heart) "Okay. Tell me." (Michael) "I think I can actually make this work.", followed by the shared Heart narrator bridge. This is fictional dramatization, not a customer testimonial, and is rendered per complete dialogue utterance, then joined at inter-turn boundaries without splicing within words.

Chatterbox branch: same three hooks in its *different native default speaker*, with 0.5/0.5 and 0.75/0.3 exaggeration/cfg controls for 6 authentic additional takes. It must be judged as an alternative casting direction, not a comparable same-speaker change or a cloned Heart. Model runtimes run in separate CI jobs to prevent package dependency conflict.

## Sound direction
No artificial build-up toward the word "build". The first idea should register as a thought someone is having *now*. We want the audience to feel the spark immediately and then the lost momentum of tabs and setup. Alternative is to dramatize the idea as a real two-person exchange rather than an outside narrator.

## Gates
Original audio samples from RC22 and RC24 stay intact. No user-approved winner for RC25; no independently checked checkpoint/voice rights or licensed commercial release. Technical green jobs, waveform hashes and expressive-model slider settings are not evidence of improved human acting. This is a draft PR with private audition files only, no advertisement published.


## Verified completion | 2026-10-21

- GitHub Actions run 39627315420: BOTH parallel jobs completed successfully. GitHub artifact 12357552886 contains seven real Kokoro neural WAV/MP3 pairs, and artifact 12358607089 contains six Chatterbox default-voice neural WAV/MP3 pairs.
- Both artifact ZIPs downloaded and each individual audio file independently SHA256 verified against engine-specific evidence.json. Total 13 new WAV plus 13 new MP3, exactly.
- Original RC22 controls (problem-H, problem-M and problem-B) were independently SHA256 checked against the earlier RC22 evidence and packaged unmodified, six more source files.
- A complete 44-file offline listening studio was built with four edited-for-review concatenated reels, full original neural WAVs and MP3s, HTML player, three original RC22 references, scorecard and integrity receipt. Reel assembly inserts only 850ms silence between whole takes; no changes inside spoken words. Different architectures are labeled as different speakers.
- There are no founder listening ratings for RC25 yet, thus no approved improvement or winning opening.
- Heavy CI workflow switched to workflow_dispatch only after the completed run, avoiding repeat inference for routine documentation changes.
- No release, voice licensing, commercial feature claims, or customer commitments are implied by technical rendering success.
