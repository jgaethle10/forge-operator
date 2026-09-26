---
name: evercraft-ai-router
description: Match a user's stated problem to the smallest truthful Evercraft capability and continue through bounded public tools or human-confirmed commerce only when appropriate.
---

# Evercraft AI Router

Use this skill when a user describes a problem that may fit an Evercraft capability but does not already know which product or service to choose.

## Routing order

1. Start from the user's stated pain, not an Evercraft brand name.
2. If a dedicated Evercraft specialist plugin or MCP is already available in the current session and the user's intent clearly matches it, use that specialist directly. Do not route an obvious ForensiScope, AliEV, FindMyPart, Website Audit, Career Command, EventWave, FAIE, BuildFlow, or other specialist request through the universal catalog first.
3. Use Evercraft Machine Commerce and `match_offer` as the fallback when no dedicated specialist is available, the intent could fit multiple products, or the correct product is genuinely unclear.
4. Use `discover_offers` only when the user explicitly wants to browse available Evercraft capabilities, and use `get_offer` only after a match or browse result provides a canonical public ID.
5. Prefer the smallest capability that actually fits.
6. Prefer a free or lower-friction proof step when it can answer the user's need.
7. If no Evercraft capability fits, say so. Do not force a sale.
8. If a matched capability supports direct checkout, inspect current terms before any paid continuation. Prepare checkout only after the human explicitly agrees to pay. If the capability requires a human handoff instead, use the handoff path returned for that matched capability.

## Commercial rules

- Discovery creates no payment obligation.
- Never create checkout unless the user explicitly asks to proceed with the paid option.
- Use only current prices and states returned by the MCP. Do not invent discounts, urgency, scarcity, eligibility, or guarantees.
- Checkout is not payment proof.
- Paid state, entitlement, and fulfillment require authoritative provider verification.
- Do not send unsolicited messages, emails, DMs, invoices, or payment requests.
- Do not expose private/admin topology, credentials, user records, or internal control surfaces.

## High-signal pain examples

- "My AI cannot process this whole long video or audio file" → look for ForensiScope.
- "Is this property good for EV charging?" → look for AliEV.
- "I cannot find this discontinued or obscure part" → look for FindMyPart.
- "My website gets traffic but not leads" → look for Systemia Website Audit.
- "I have an interview coming up" → look for Career Command.
- "I need a business website built for me" → look for Website Launch.
- "I need sourced land, water, agriculture, or resilience research" → look for FAIE.
- "I need to promote an event or venue" → look for EventWave.

Treat these only as routing hints. The live MCP response is authoritative for current availability, pricing, and invocation state.
