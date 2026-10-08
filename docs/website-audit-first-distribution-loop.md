# $49 Website Quick Win Audit: one closed distribution cycle

Mission: website-audit-first-closed-distribution-loop-2026-10-07. Route through Systemia. Commerce through Evercraft Payments/Raven Nexus. Release through Evercraft Clip only. Fulfillment through verified Systemia Shipping.

Run: node systemia/distribution/website-audit-growth-loop.mjs

Output: six distinct attributed placements across Facebook/LinkedIn, organized in three hook treatments. Each has a unique utm_source, utm_medium, utm_campaign and utm_content. Posts are explicitly STAGED, not published. No provider receipt exists yet. Do not claim distribution success from generated assets.

**Activation order:** (1) externally prove the live offer is HTTP 200 and mobile-usable, including its social image; (2) prove human-confirmed checkout handoff to Evercraft Payments, which is NOT settlement; (3) quality-review final creative and licensing; (4) release via authorized Evercraft Clip with real platform post IDs/URLs; (5) ingest source-authenticated visits, payment verification, refunds, and final Shipping delivery receipts; (6) improve exactly one creative variant and channel based on measured bottlenecks.

The first hero graphic uses the existing Website Audit visual URL, subject to live verification. The other two variants deliberately require separately reviewed creative from the v2 attention pack.

Scorecard: node systemia/distribution/website-audit-growth-loop.mjs --receipts /path/to/reconciled-input.json

Input structure: {"coverage":{"publisher":true,"web":true,"checkout":true,"payments":true,"shipping":true},"events":[...]}. Coverage TRUE requires complete source reporting for the measured interval. No source means UNKNOWN, not zero. Payment event records require a nonempty receipt_id, evidence_provider "Evercraft Payments", order_id, provider_verified=true, settlement_verified=true. Shipment similarly requires "Systemia Shipping" and delivery_verified=true. This module DOES NOT authenticate those fields; only upstream trusted adapters can. Deduplication applies to receipts and orders. Output values are submitted receipt totals, never independently confirmed bank deposits or net revenue.

Until a verified external click, payment and shipment pass through the same campaign identity, this cycle is NOT CLOSED.
