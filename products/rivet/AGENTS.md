# RIVET agent contract

RIVET is moving off Base44 as a product runtime. GitHub is canonical source; Systemia owns admission and orchestration; Yard Operator / Evercraft Compute owns release and runtime placement.

## Hard boundaries
- Do not create new Base44 product surface, workflows or architecture.
- Treat `base44/` and `@base44/sdk` as temporary compatibility adapters until their contracts are extracted.
- Preserve owner/customer separation, row-level access controls, server-side payment verification, bounded public inputs, safe redirect/origin handling and non-leaking public errors.
- Do not claim report generation is fixed or ready from a build alone. Require a real authenticated report run reaching `generation_state=ready` with source-backed evidence.
- Preserve the RIVET/AliEV contract during visual or brand work.

## Brand source of truth
Use `BRAND.md` and `public/rivet-brand.json`.
Bone light mode is the default. Midnight dark mode is optional. Neon is for live/locatable state. Deep Cobalt is reserved for the primary action. Headings use Open Sauce One; body copy uses Public Sans.

## Gates
Run:
```bash
npm run build
npm run security:audit
```

The build preflight runs lint, typecheck, the security gate and the RIVET/AliEV contract suite.
