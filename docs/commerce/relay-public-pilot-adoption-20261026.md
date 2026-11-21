# Relay public pilot rollout / 2026-10-26

## Goal and evidence boundary
Evercraft Relay is the separately built decision-alignment product, **not** the Evercraft Studio and **not** the notification service using the same name. Existing v0.1 locally demonstrated independent check-ins, deterministic milestone/date comparison, a human-confirmed versioned record, and participant acknowledgments. The v0.2 private source archive hardens 14-day bearer invitations, authenticated reissue/revocation, strict dates, and loopback-only operation; it was tested locally outside the public GitHub repository and is not a hosted service or accepted security audit.

The public [private pilot page](https://jgaethle10.github.io/forge-operator/relay/pilot/) remains the canonical CTA. This branch adds a **fictional browser-only demonstration** of the interaction, not real customer functionality, records, account access, AI understanding, commercial proof, or an invitation to upload meeting data.

## Distribution posture
- Position: “The meeting ended. Did everyone hear the same decision?” Share a single concrete conflict (November 2: construction begins vs. permits submitted), then explain human confirmation and acknowledgement.
- CTA: Request a scoped private Relay pilot. No paid checkout or automatic enrollment.
- Use only **source/right-cleared** RC35 media with owner approval and verified upload capability. If that proof is missing, use an ordinary text/link update rather than falsely claiming new video distribution.
- First-party publish destinations: editorially appropriate Evercraft/Systemia company channels only, after identity/permission, duplicate, owner and Clip receipt verification.
- **Never route this campaign to Havenly Cleaning, EPS, or R&B Chicken & Soul.** Do not duplicate founder LinkedIn posts already published.
- Source of truth for broader page estate and Clip cutover: PR #1602 / #1601, and video adapter PR #1593. Existing drafts are not provider post receipts.
- No automatic publishing, outreach, budgets or customer-facing promises from this branch.

## Two-paragraph campaign copy (fresh follow-up, not RC35 reuse)
The meeting ended. Everyone nodded. Then one team scheduled construction for November 2 while the other thought November 2 was the *permit submission*. That one difference can send an entire project down two different paths. **Evercraft Relay** is built around catching that disconnect while there is still time to clarify it.

Relay's current private pilot collects independent structured check-ins, flags differences in dates or milestone meanings, and helps a human confirm one versioned decision that people can acknowledge. It's early, and that's exactly why we're inviting teams to shape it. **Explore Relay or request a private pilot:** https://jgaethle10.github.io/forge-operator/relay/pilot/

## Follow-up content calendar (review before scheduling)
1. Product story: November 2 contradiction. Text/link, not recycled commercial. Goal: qualified pilot inquiries.
2. Proof explain: show the fictional public walkthrough after its PR is merged, verified externally, and reviewed on mobile. Explicitly label it as a simulation.
3. Audience question: "Where do decisions get lost in your work: meeting follow-ups, handoffs, owners, or dates?" Use consent-aware discussion, no confidential details.
4. Technical build note: describe real v0.2 invitation hardening only after receipt verification; do not imply production security.
5. Pilot call: specific invite for small teams with repetitive handoff confusion; personal review only, no guarantee of acceptance or automated integration.

## Conversion measurement
Capture only authorized, privacy-minimized inquiry counts and source tags: page sessions where legitimately measured, CTA interactions, pilot requests received, qualified pilot conversations, and accepted trials. Do not invent traffic, buyer demand, responses, or revenue. The current page's email draft action is not itself a submitted lead; confirmed inbound mail is the first real inquiry evidence.

## Engineering milestones
1. Keep the v0.2 source archive private pending ownership and security review. Verify its SHA-256 and test logs before integration.
2. Add test cases for expiry, reissue continuity, owner-token rotation and endpoint abuse protections.
3. Design tenancy/identity, consent, retention, backups, audit receipts and production TLS deployment before any external customer data.
4. Integrate user-approved mail/calendar connectors only when actually implemented and tested. Rule-based comparisons are not AI semantic inference.
5. Review the public demo and copy for authenticity, mobile performance, accessibility and truthful product claims before approval/merge.

## Publish/merge gate
- Product page demo PR passes CI and founder preview.
- Confirm external HTTPS and mobile rendering after merge.
- Social publisher must produce destination, account identity, media digest (if any) and provider receipt for each publication.
- No posting the old RC35 video again without rights/provenance and repeat-use approval.
