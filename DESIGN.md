# Evercraft Design Contract | v1

**Status:** first-party authoring standard and static-source contract. This is not a deployment receipt, a rendered-browser quality certificate, or a new product.

## One OS, many recognizable worlds

Systemia is the authority for work and release admission. Saban coordinates bounded design and engineering assignments. Evercraft Home/HQ is the human front door; Graphics Command, Visual Desk and Fallen already own visual production lanes; Human Experience Sentinel and Customer Gauntlet own inspection. This contract joins their expectations instead of creating another design department or third-party runtime.

**The brand system has an institutional backbone and distinct product identities.** Do not copy the HQ palette into every product. Preserve existing checkout prices, approved marks, product scope, public URLs, release gates, and brand-specific work.

### Existing design anchors (observed in the repository, not invented)

| Surface | Palette and voice | Existing source |
| --- | --- | --- |
| Evercraft Headquarters | Architectural dark `#07090d`, brass `#b79a56`, focus ice `#4fb8ff`; consequential, welcoming, no fake live telemetry | `public/headquarters/tower.css` and `index.html` |
| Work Saban | Paper `#ffffff`, soft white `#f8f8f7`, crimson `#a4142f`, ink `#171717`; task-first, approachable | `public/work-saban/index.html` and `docs/design/CLIENT-FACING-SIMPLICITY.md` |
| Seven commercial brand worlds | Each has its own approved foundation, accent, typography and metaphor; no homogenizing | `docs/branding/evercraft-os-seven-brand-worlds-20261109.md` |

## What every design agent must do

1. Read the target product's current source and existing contract before proposing a redesign. Keep the real product name and proven state.
2. Produce one human task, one intended result, one primary action, and at most three up-front steps. Use progressive disclosure for evidence and advanced controls. Never bury required consent, terms or price.
3. Match the product's existing tokens or document a deliberate, reviewable design change. Never silently recolor the whole portfolio or introduce mock customer activity presented as live.
4. Design mobile-first. Verify legible text, keyboard focus, navigation labels, empty/error states, motion reduction and responsive overflow. Static source checks alone never prove pixels or keyboard behavior.
5. Run the static contract (`npm run test:design-contract`) and the existing Human Experience Sentinel / Customer Gauntlet gates. A missing browser receipt is BLOCKED, not PASS.
6. Return the source diff, user-path explanation, accessibility evidence, static-check result, and independent rendered-browser result before seeking release authority. Systemia/Passport governs any resulting publication or production mutation.

## First-party measurable rules

- HQ must retain its recorded dark/gold/ice root custom properties; Work Saban must retain paper/crimson/ink/soft-white properties until a consciously approved brand revision.
- HQ and Work Saban HTML must include a meaningful title, declared language, viewport, and visible-keyboard focus styling. HQ also retains its existing skip-to-content link.
- Source-only inspection is deliberately bounded. It does not certify contrast ratios, layouts at a real viewport, artwork, interaction, accessibility, performance or a live deployment.
- Do not add externally hosted fonts, SDKs, trackers, or runtime scripts simply to make a demo look polished. Local, first-party assets should be the default.

## External references evaluated on 2026-11-15

- `nextlevelbuilder/ui-ux-pro-max-skill` is MIT licensed: useful as a design reasoning reference.
- `VoltAgent/awesome-design-md` is MIT licensed: useful as an example of agent-readable design documentation, not a source of Evercraft brand identity.
- `pbakaus/impeccable` is Apache-2.0 licensed: useful as a design-review reference.
- No third-party code, templates or design assets were installed, vendored, or executed as part of this v1. Before copying future code/assets, audit the exact files, transitive dependencies, license notices, provenance, security and compatibility with owned infrastructure.

## Existing ownership and routes

- Visual story and source rights: `systemia/visual-desk/` and `systemia/graphics-command/`.
- Product usability/static risks: `systemia/experience/human-experience-adapter.mjs`.
- Real browser evidence: Customer Gauntlet / Raven Nexus, not the static contract.
- Mission routing: Systemia. Worker formation: Saban. Authorization: Passport. Human entry: Evercraft Home/HQ.

## Release states

`source_pass` means only the tracked source declarations and basic HTML affordances match; `source_fail` means drift or unavailable source. Neither means a site was deployed, visually inspected or sold anything. Do not put a green live/readiness badge on a static pass.

**Source of truth:** This contract complements `docs/design/CLIENT-FACING-SIMPLICITY.md`, the seven-brand-worlds brief and existing experience systems. Where a change is proposed, update the corresponding owned brand source and its explicit design profile in the same reviewed change.

## Customer-visible release acceptance

**Additional binding implementation:** [Evercraft Customer Experience & Public Release Standard (CX-001)](docs/design/CUSTOMER-EXPERIENCE-RELEASE-STANDARD.md). It requires actual desktop/phone/tablet task walkthroughs, a usable non-dialer desktop conversion path, owner-specific business language, bilingual end-to-end testing, verified public HTTPS, and separate approval for customer promotion. Its configurable static source preflight and negative-case tests supplement, but never replace, independent browser/authorization receipts.
