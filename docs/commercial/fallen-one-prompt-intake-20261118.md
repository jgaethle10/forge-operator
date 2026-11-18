# Fallen Studios | One-prompt customer entry (November 18, 2026)

## Product intent
Customers begin by describing a video in ordinary language. Fallen transfers that creative idea to the **existing** commercial intake, with contact and consent collected only at the submission step. The customer should not have to decide settings or learn an editing interface.

## Implemented in this source change
- Prominent `What are we making today?` prompt on `/fallen-studios/`, responsive and keyboard accessible.
- The idea is carried by first-party `sessionStorage` across the same-origin page transition and prefilled into `/commercial-studio/#inquire`. It is never appended to a URL, placed in `localStorage`, transmitted before user submission, or used to start an agent or render.
- Single-use, 30-minute expiration, 12- to 1800-character validation.
- Existing `/api/commercial-studio/inquiry` consent, scope, rights and manual review gates stay unchanged.
- One click to continue, but not a promise of an immediate generated video, purchased production or delivery.
- A direct link to the ordinary inquiry remains available if session storage is unavailable.
- Contract and browser tests must verify end-to-end handoff and no premature POST.

## Next engineering layers, not claimed in this PR
1. Bind customer-approved projects to private authorized source assets and a Saban-directed production plan.
2. Add conversational revision requests against versioned shots, with preserved approved components.
3. Retain brand preferences only with explicit user permission and secure customer isolation.
4. Render candidate masters using owned production tools, then enforce rights, provenance, voice, music and final-master approval before any release.
5. Provide approved formats and repeat-from-last-project actions only after verified storage and delivery workflows exist.

**Release truth:** a working first-party creative brief handoff is not self-serve film generation, customer video delivery, or a live commercial order. GitHub changes require CI review and a separate public readback before public launch may be claimed.
