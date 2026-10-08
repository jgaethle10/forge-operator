# Space Dudz design-to-print loop

Canonical mission: `space-dudz-design-to-print-2026-10-07`

## Objective

Turn the Evercraft-owned graphics stack into a repeatable Space Dudz commercial loop:

`Graphics Command / Fallen -> design tournament -> public vote -> winning design -> Evercraft Payments preorder evidence -> print authorization -> printer -> fulfillment`.

This lane is demand-first. A vote is creative signal, not revenue. A payment authorization is not settled revenue. Printing is only authorized after settled preorders meet the campaign threshold and the winning print asset has a real printer quote whose total cost is covered by settled preorder funds.

## System boundaries

Systemia owns mission admission, lineage, receipts, campaign state, and the handoff between graphics, commerce, and production.

Fallen / Graphics Command owns candidate generation, creative genome lineage, visual QA, print-ready assets, and provenance.

Space Dudz storefront app ID: `692a2faa1b464e40bacd89aa`.

The storefront public route is `/design-lab`. Design records carry `campaign_id`, `public_stage`, `source_system`, `source_asset_ref`, `creative_genome_digest`, `provenance_refs`, `preorder_product_id`, `preorder_goal_units`, `print_partner_ref`, and `print_status`.

Evercraft Payments is the canonical payment evidence surface. Processor-specific settlement rails remain adapters. Only receipts in a settled `paid` or `captured` state count toward a print trigger.

## State machine

1. `designing`: Graphics Command produces multiple candidates.
2. `voting`: the public Design Lab accepts anonymous one-session preference signals.
3. `preorder`: the selected winner is attached to a preorderable product.
4. `print_ready`: settled preorder units meet the threshold, a print-ready asset exists, and a printer quote is present and covered by settled funds.
5. `printing`: an explicit downstream production action has been taken.
6. `fulfilled`: orders have completed fulfillment.

The engine in `space-dudz-drop-engine.ts` makes the `print_ready` decision but deliberately does not place a paid printer order. That external spend remains a separate execution receipt.

## Acceptance rules

- At least two candidate designs per tournament.
- Candidate provenance must be complete and source receipts must be present.
- Community rankings are deterministic.
- Votes do not authorize spend.
- Processor authorizations do not count as paid preorders.
- Losing-design payments never fund a winner threshold.
- Duplicate payment receipts fail closed.
- Missing printer, print asset, quote, or insufficient settled funds deny print authorization.
- When authorized, print quantity equals settled winning preorder units and maximum print spend equals the quoted cost for those units.
