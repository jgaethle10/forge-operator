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
