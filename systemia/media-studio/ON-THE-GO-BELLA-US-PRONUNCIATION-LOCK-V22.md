# On The Go Mobile Quick Lube | Bella US pronunciation lock (V22)

Customer-facing brand name: **On The Go Mobile Quick Lube**.

## Spoken pronunciation
- US English **Mobile**: **MOH-buhl** (rhymes with *noble*), never *mo-BEEL*.
- Kokoro phoneme override: `[Mobile](/mˈObəl/)`.
- Original engine voice ID: `af_bella` (Kokoro 0.9.4).
- For all opening and closing utterances, apply the override **inside the complete sentence**, not as a separate spliced word.

## Audition/run receipt
- Source branch: `feature/onthego-bella-native-voice-20261026`
- Triggering source commit: `662fee0444931a61fb7fbdf84ce4179d35f7ae4c`
- Successful GitHub Actions run: `40603505855`
- Generated artifact: `12780550457`
- Verified output phonemes in both generated utterances: `mˈObəl`.
- Approved visual reference: V18. V17 and V18 must never be modified.
- V22 rendered owner review MP4 SHA256: `dbfd4794ec2910deeb8ffdff9fb98a75eea8a004711d91d5f89615a878d7fc9f`.
- Video elementary stream identical to V18 (MD5: `467ad82e0ac3d3e32987e1bd53a6f9b7`).
- Final status: **private owner review, subject to human listening and client approval**, not published.

## Regression gate
All future renders using the customer's name must generate the *entire* line with phoneme override. Fail closed if emitted Kokoro phonemes for the name lack `mˈObəl`. Do not use the literal unmodified string `Mobile` as Kokoro input, any previous V17/V18/V19/V20/V21 raw business-name recordings, or a single-word splice. Preserve voice, music source and original visual frames unless specifically approved.
