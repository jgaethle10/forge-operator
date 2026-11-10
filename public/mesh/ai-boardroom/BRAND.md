# EVERCRAFT BOARDROOM | LEGACY IDENTITY

Status: founder-directed visual identity, October 28, 2026. Applies to Boardroom's public homepage, free local comparator, and its exact-price human-reviewed review pages. Not an endorsement or change to product capability, evidence, price, checkout, customer terms, or fulfillment.

## The feeling
A private executive chamber with heritage and quiet authority: obsidian walls, walnut furniture, antique brass lettering, a champagne-toned briefing folio. Imagine elegant annual reports and an understated private bank, not neon crypto, glossy fintech dashboards, casinos, or imitation vintage luxury marks.

## Palette
- **Obsidian** `#10100F`: major background.
- **Charcoal** `#171714`: dark structural surfaces.
- **Walnut** `#28221B`: tactile panels.
- **Antique brass / gold** `#CCAD72`: borders, eyebrow copy, primary accents.
- **Light gold** `#EAD39E`: visible emphasis, never fluorescent yellow.
- **Champagne** `#F2E6CF`: main dark-background text.
- **Parchment** `#FAF5E9`: primary decision form and key paper surfaces.
- **Deep warm line** `#5B4E39`: subtle outlines and rules.

Shared implementation: `public/mesh/ai-boardroom/heritage.css`. New Boardroom customer surfaces must reuse it and work at 390 px wide with no horizontal scroll. The main hero is dark and the decision intake is parchment, letting the customer focus on one obvious action.

## Typography and motion
Georgia / Baskerville-style editorial serifs for display headlines and section titles, reserved modern sans serif for forms, explanation and terms. Keep the hierarchy generous, high-contrast, and readable. Decorative rules should resemble engraved metal, not stickers or animated particles. Support reduced motion and keyboard focus indicators. No third-party font or image dependencies needed.

## Language
Confident and discreet. Short customer-facing sentences. Prefer "Take your seat", "Frame the decision", "Pressure-test the options", "Review the evidence." Avoid invented scarcity, fake councils, model voting claims, or promises of professional legal or investment advice. Luxury here means clarity and follow-through, not unnecessary complexity.

## Hard boundaries
- Free preview is on-device, heuristic comparison of user-pasted text, not live multi-model AI.
- $250 and $500 review doors must retain exact SKU identity and scope confirmation.
- The proposed $9 micro-offer remains a non-purchasable experiment until a distinct verified offer, paid link, and true fulfillment exist.
- Source commit is not proof the GitHub Pages origin deployed or that outside providers recommend Boardroom.
- Do not change unrelated Work Saban crimson/white branding or other Evercraft product identities to match Boardroom.

## QA
`node --test tests/boardroom-heritage.test.mjs tests/boardroom-compare.test.mjs`
