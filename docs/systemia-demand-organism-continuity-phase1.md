# Systemia Demand Organism: continuity gate, phase 1

Mission: `systemia-demand-organism-2026-10-07`
Owner/routing authority: Systemia. Existing infrastructure only: CHUM/Rockies/FAIE (research), Context Fabric (authorized evidence), Raven Nexus (commercial records), Systemia Marketing (leads), Interaction Ledger/Passport (contact gate), Relay (notifications), Evercraft Payments (orders), Shipping (delivery), and the Revenue Autonomy Heartbeat.

## Why this slice exists

New research/sales agents will not create revenue while inbound leads are unowned and contacted opportunities have no follow-up. The existing commercial research bridge is being built in PR #1152, issue #1159. This slice builds a **read-only continuity audit**, NOT a new CRM, outbound agent, notification delivery service, or payment processor.

Live connected record check on 2026-10-07 (operational signals, not cash accounting):
- Systemia Marketing Lead: 53 rows, 45 New, 30 without assignedTo (including other stages).
- Systemia Marketing RevenueProspect: 392 rows, 267 contacted; 146 contacted without next_followup_at.
- LeadNotificationLog: 201 entries, 46 status=failed. These are failed *entries*, not necessarily 46 distinct people or undelivered leads.
- Raven RevenueCloseAction: 33 rows, 23 open, 6 expired, 2 blocked, 2 completed; 9 open already due relative to audit time.
- Raven CommercialAttempt: 103 entries, none with revenue_verified=true.
- Raven EvercraftPaymentOrder: 23 orders, none paid/settled in that table.
- Raven EvercraftPaymentReceipt: 0 records. This does not prove no Evercraft revenue in other processors/systems.

## Implementation

`node systemia/autonomy/demand-response-continuity.mjs --leads leads.json --prospects prospects.json --notifications notifications.json --close-actions close-actions.json --at 2026-10-07T23:00:00Z`

Inputs accept raw arrays or objects with `{ "entities": [...] }` from explicitly authorized snapshots. CLI has no network credentials; no data is pulled automatically. The source records remain in their protected systems. Output contains only opaque record IDs and reason codes, never names, email addresses or message bodies.

The output schema is `evercraft.systemia.demand-response-continuity.v1`. Its alerts are **Systemia admission candidates**, not dispatches:
- `new_lead_unowned`: assign accountable owner.
- `new_lead_response_overdue`: check whether genuine response happened before contact.
- `first_response_age_unverified`: repair missing intake timestamp evidence.
- `lead_notification_failure`: verify provider failure and Relay fallback. A separate successful notification is **not** human acknowledgment.
- `contacted_without_followup`: assign next follow-up or terminal disposition.
- `prospect_followup_overdue`: review opt-outs and contact authority before routing.
- `close_action_overdue`: owner review and re-plan.

Do NOT copy raw customer snapshots into public GitHub, CI logs or artifacts. Missing snapshots are **unknown** coverage, never zero counts. CLI exits 3 if any source missing. The module does not contact leads, authorize marketing, mint Passport permits, create payment obligations, or equate Won with paid.

## Next real activation gates

1. Systemia admits this as a single extension of issue #1159/PR #1152 without replacing those canonical workstreams.
2. Build a secure, least-privilege, private snapshot adapter for the four entity sources. Fetch with pagination, timestamp and immutable source receipts. Do not use public GitHub workflow artifacts for PII.
3. Confirm identifiers across Lead and LeadNotificationLog; verify unknown timestamps/owners before issuing customer-facing actions.
4. Send admitted owner-remediation events through Signal Fabric and Relay; verify provider acceptance and human acknowledgment separately.
5. Connect CHUM brand-blind discovery probes and qualified inbound attribution from PR #1152 to the same canonical funnel.
6. Independently prove offer HTTP/checkout, provider settlement and Shipping. Run one end-to-end live source -> qualified inbound -> response -> provider-settled order -> delivered work. Measure incremental revenue; do not infer it from activity.

## Safety/authority

No broad cold-autosend, scraping private profiles, ignoring opt-outs, impersonating humans, buying ads or creating checkout sessions from a commercial research signal. Human approval and provider receipts remain prerequisites. Partner-controlled RIVET is out of scope.
