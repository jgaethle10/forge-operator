# Native public offer checkout expansion, 2026-10-15

Scope: the 13 approved buyer-door products, plus the existing native IBM i Estate X-Ray and Legacy Rescue Scan. Part Quick is an alias for the existing native FindMyPart Quick Hunt. These are distinct fixed products, not interchangeable same-price checkout links.

Existing five routes retain Raven. Ten additional fixed products route from the owned Fabric form to central Evercraft Payments and reuse the existing branded handoff and hold pages. The central runtime remains responsible for approved offer and fulfillment-contract checks. Fabric verifies exact returned amount and currency and requires explicit confirmation and a customer email. No charge was made in this work.

Fresh non-purchasing live quotes: all 13 returned HTTP 200, exact approved amount, ready fulfillment contract. Python default requests were initially blocked with HTTP 403; the existing Fabric user agent succeeded. Quote readiness is not checkout creation, paid state or delivered work.

| Offer | Cents | Live quote | Contract ready |
|---|---:|---|---|
| website-audit | 4900 | 200 | True |
| workflow-xray | 25000 | 200 | True |
| browser-diagnosis | 14900 | 200 | True |
| payments-pilot | 75000 | 200 | True |
| part-quick | 1900 | 200 | True |
| part-deep | 4900 | 200 | True |
| part-rescue | 9900 | 200 | True |
| legacy-xray | 25000 | 200 | True |
| ibmi-xray | 25000 | 200 | True |
| site-survive | 25000 | 200 | True |
| sign-pilot | 25000 | 200 | True |
| towi-evidence | 75000 | 200 | True |
| event-boost | 4900 | 200 | True |

Validation: 46 local routing/runtime/installer tests passed, including all ten new routes, exact SKU forwarding, explicit confirmation and rejected price drift. Shell syntax and diff checks passed. GitHub checkout production truth and relevant native proofs passed. Two independent CI failures remain: locked RIVET baseline hash drift (also observed before this patch) and the untouched Home Raven adapter fixture (expected one execution, observed zero), reproduced in the original checkout without these changes.

Deployment repairs: release directory group traversal; Home Git scoped trust and Caddy environment; consume the complete EarthWorks page when grepping under pipefail. Audit URL input now explains HTTPS and fits the mobile form.

Pending: deployment and live browser handoff verification for each newly exposed product; authoritative settlement and actual delivery. Only Website Audit has the founder's live mobile handoff screenshots in this session. No blanket end-to-end readiness claim is made.
