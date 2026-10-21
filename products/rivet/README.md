# RIVET

RIVET's canonical source now lives under `products/rivet/` in Forge Operator while runtime migration proceeds through Systemia and the Yard / Evercraft Compute path.

Base44 code remains in this snapshot only as a temporary compatibility adapter for the current auth, data, payment, report-generation and AliEV contracts. New product capabilities should not be added there.

## Brand
The active visual standard is **RIVET Brand Kit Vol.1, updated 2026-09-24**.

- Bone `#F5F2EA` is the default light canvas.
- Midnight `#0B1424` is dark mode.
- Deep Cobalt `#1F4AAB` is the primary-action color.
- Neon `#62D134` marks live or locatable state.
- Slate `#64748B` carries muted information.
- Open Sauce One is the heading family.
- Public Sans is the body family.

See `BRAND.md` and `public/rivet-brand.json`.

## Release
```bash
npm ci
npm run build
npm run security:audit
```

A passing build is not proof that customer report generation is live. Production readiness still requires a real authenticated report run reaching `generation_state=ready` with source-backed evidence, followed by independent route verification.
