# Nebraska | The Giant Stirs: source-first film pilot

This is a *governed executable preproduction bundle*, not a finished documentary. The experimental 22.5-second externally rendered camera study from the October 19 session was made with **synthetic illustrations** outside the native Fallen exporter. It does **not** prove World Engine → Fallen → Clip integration or 2026 footage rights.

- `opening.plan.json` is valid for `npm run media:studio -- studio-create`.
- Scene durations total **22.5s**. Missing picture, narration and music are intentionally `pending://`.
- `opening.test.ts` runs the **real canonical Fallen Studio compiler** and proves that none of the pending assets can silently export through the merged timeline exporter.
- The real claims for Indiana (20–17) and Oregon (17–14) are sourced from Nebraska Athletics; shots remain unlicensed and cannot impersonate actual game film.
- Read-only source references are not a video-rights grant. Any archive image needs actual bytes, rights record, adaptation credit, capture-date labeling, and creative review.
- Human voices must be separately auditioned and cleared. Generated placeholder speech is not a signed fan interview.
- ACI/Creative Council → production admissions → shot tournament → master QC → documentary preflight (#1437) → founder review → Clip is the intended controlled sequence, **not verified as one running integration**.

**Review command:**
```sh
npm install --no-audit --no-fund
node --import tsx --test systemia/media-studio/pilots/nebraska-source-first/opening.test.ts
npm run media:studio -- studio-create systemia/media-studio/pilots/nebraska-source-first/opening.plan.json /tmp/nebraska-source-first.json
```
No external vendor/model calls are made by these tests. All image, video, paid provider, rights, and publication gates remain closed.


## October 20 anti-template creative correction

The previous 22.5-second MP4 passed H.264/AAC technical decode but **failed 5 of 5 intended observational-action shots** under `systemia/media-studio/observational_motion.py`. Camera movement across static artwork does not prove subject or environmental action. Synthetic pictures remain labeled as such, and do not become 2026 game footage.

The revised opening changes the creative grammar:
- First scene uses genuine stadium/location sound, **not** opening wall-to-wall narrator and music.
- Real consenting fan testimony must be recorded, released, and preserved as a human voice, not invented dialogue.
- Actual licensed Indiana/Oregon plays are required to show real physical action and late-game change.
- Every cut has a reason in the events on screen: observation, reaction, action, or causal contrast.
- The final **four seconds** are intentionally unscored, rather than a giant heroic logo.
- Narration exists in only two of six planned scenes. This is an editing target, not an audible render.

`opening.observational-edit.json` records the six shots with viewer questions, observable action/reaction, source state, intended primary sound, and reasons for cuts. `observational-edit-preflight.mjs` checks the structured plan for stale timing, synthetic footage masquerading as game action, score-only pacing, overly repetitive editorial purposes, and insufficient planned real footage / natural sound / silence. Run:

```sh
node --test systemia/media-studio/pilots/nebraska-source-first/observational-edit-preflight.test.mjs
node systemia/media-studio/pilots/nebraska-source-first/observational-edit-preflight.mjs \
  systemia/media-studio/pilots/nebraska-source-first/opening.plan.json \
  systemia/media-studio/pilots/nebraska-source-first/opening.observational-edit.json \
  /tmp/nebraska-observational-edit-report.json
```

**Gate boundaries:** a valid narrative intent cannot certify the underlying video contains real movement, can authenticate neither source rights nor the claimed human editor's identity, and cannot judge whether a shot feels compelling. The expected passing structural state is **`structure_passed_assets_pending`**, not ready-to-render or publish. The additional optical-flow checker supplies only a separate camera-compensated movement diagnostic. Editorial and rights approvals and actual footage remain blocked. Any publication or provider spend requires separate founder authorization.
