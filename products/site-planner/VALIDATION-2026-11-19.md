# Site Planner | Local validation receipt, 2026-11-19

This receipt documents tests of the independently packaged application. The application source files **have not yet been imported into this repository**; the package is a ChatGPT conversation attachment and cannot be treated as a production checkout.

## Test results
`python3 -m unittest discover -v`: **4 passed, 0 failed**.

Coverage:
- Originating order/report and returned-plan reference binding.
- Server rejects a plan registered against an order belonging to another site.
- Site report snapshot remains unchanged after evidence or site metadata updates.
- Negative and fractional charger counts, negative power and cost rejected.
- Cross-site scenario cannot be ordered and creates no orphan report/order.
- Outbox entries remain pending without Systemia delivery receipts.

## Local artifact SHA-256
- `server.py`: `61acd51045eea01ce63686d0595081a95f170735ca192209141d4b13c7092c3d`
- `index.html`: `32c2ab3c399d85edec488756b5465e9d7f1aff49ec30e6f7b5ffcd59b493afdc`
- `test_workflow.py`: `ea054b4af8e60496b69e29ab9c4746a7807dfb652344dacc81a0e8af2663273b`
- `README.md`: `07014dcddfd94dbaa0b8ccaea765a695509fef7fdc2af4f1568d439ce56c42fc`
- `evercraft-site-planner.zip`: `aca2d7b4a52bfa47c0e0b02fc713695f6f10663dc45ed68c67c3e54442dbb97e`

## Remaining blockers
Full source import, a GitHub CI test gate, signed outbox dispatcher, authenticated role/tenant access, validated source imagery, safe upload processing, report order/payment integration, and owner-controlled private deployment. Do not ship this as a public site until these pass.
