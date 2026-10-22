# Nebraska | The Giant Stirs: source-first film pilot

## Series production | October 21, 2026 | Historical-trilogy director correction

**Original film:** `NEBRASKA | THE GIANT STIRS` is now a **historical-rise → program-decline investigation → evidence-of-turnaround** trilogy. The 2026 games are a piece of Episode 3, not the entire concept. These are development plans, NOT three filmed 25-minute episodes.

- [Season One director's bible](SERIES_BIBLE_SEASON_ONE.md): **Episode 1, The Giant** (earliest history, Devaney/Osborne, five titles); **Episode 2, The Sleeping Giant** (Solich/Callahan/Pelini/Riley/Frost and institutional changes); **Episode 3, The Giant Stirs** (the Rhule-era rebuild and actual future results).
- [Season structure](series.season1.json): 3 × 1,500-second editorial targets, 18 scenes, 75 minutes **planned only**, with 22–28-minute flexibility for real material.
- [Historically attributed evidence](history.evidence.json): **20 primary-source and researched claims**, including 1969 Boyd Epley strength development, five titles, nuance in the post-Osborne coaching eras, 2024 first bowl breakthrough and the incomplete 2026 season.
- [Unified media and participant source registry](series.sources.json): **33 actual source needs/discoveries**, including four verified original media sources, many missing dynasty and decline-era game clips and missing consented interviews.
- [Source rights docket](source-rights-docket.json): even accessible historical film must have verified collection and distribution permission; research URLs do not automatically grant footage rights.
- [Interview field guide](FAN_INTERVIEW_FIELD_GUIDE.md): real intergenerational supporters, primary witnesses and independent football researchers, with actual participant consent and original sound.
- `before-the-echo.scenes.json`: existing authentic 50-second early-football/NARA scene candidate belongs to **Episode 1**, private research review only.
- `ten-seconds.chapter.json`: source-locked **138-second PLAN**, now a candidate part of **Episode 3**; no authentic 2026 broadcast footage has been acquired.
- `series-production-gate.mjs` and `series-production-gate.test.mjs` protect this historical plot and reject invented game outcomes, simplistic claims about the Pelini era, unverified broadcast footage, made-up releases and padded-episode completion claims.
- `.github/workflows/fallen-nebraska-series.yml` writes a machine-readable, source-blocked series preflight receipt.

As of October 21, 2026, Nebraska was 5–2, with Washington scheduled October 31. The rest of the season and Episode 3 ending are *unknown*, not scripted. No episode is scheduled for distribution while rights, interviews, verified original game film, human creative approval and source-attributed analysis are missing.

**Run a true series development preflight:**

```sh
node --test systemia/media-studio/pilots/nebraska-source-first/series-production-gate.test.mjs
node systemia/media-studio/pilots/nebraska-source-first/series-production-gate.mjs \
  systemia/media-studio/pilots/nebraska-source-first/series.season1.json \
  systemia/media-studio/pilots/nebraska-source-first/series.sources.json \
  systemia/media-studio/pilots/nebraska-source-first/history.evidence.json \
  /tmp/nebraska-series-preflight.json
```

**The only valid completed preflight status is** `structure_passed_sources_and_rights_blocked`. That is an honest research/editing plan, not 75 minutes of usable rights-cleared footage, a legal opinion or a certification of film quality.

---


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

## Authentic Lincoln archive canary (October 20)

The native GitHub runner completed an **actual internet media acquisition and real-frame render** for an independently recorded 2011 Lincoln shot. The original Wikimedia Commons file, by CrunchySkies, has a Commons-published CC BY-SA 3.0 license, 10,973,914 bytes, SHA-1 `d7fb114b1d2e9b0b12556950e0c45b6797f947ac`. The CI source matches BOTH exact bytes and digest. The eight-second excerpt uses **only observed original film pixels and original audio**, does not invent atmospheric sound, and passed full MP4 decode as 1280x720 H.264/AAC.

GitHub Actions run **39476057525**, artifact **12289935681**, contained the movie, three original movie frames, a SHA-256 receipt and attribution. MP4 SHA-256: `a3742adba9b0eaf0c02dcc4c7b15c95659cb1d1768bd2d5450bfe0d68a72378d`.

Human frame inspection saw the camera pan from heavy clouds toward a windmill. This is real **2011 Lincoln geographic atmosphere**, not stadium, football or an interview, and has not been admitted to a final Nebraska cut. Original audio has been retained, but independent editorial listening/third-party music clearance is **not** evidenced. The CC BY-SA ShareAlike condition requires independent release analysis; do not publish by default. See `source-rights-docket.json` for exact source refs, true owner contacts, game film shortages, usage boundaries and no-outreach receipts.

**Release gate still closed**: full game footage rights, current interview releases, authenticated audience/field audio, image/sound creative review, and scene licensing are missing. `source-rights-docket.json` is a research record, not contact/outreach authorization.
