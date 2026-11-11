# Product Brand Review Result / Immutable Decision Report Template

> Duplicate this into `BR-###-<slug>-decision-v#.md` **after** the founder actually decides. Do not pre-populate a positive outcome. Earlier reviews are never overwritten, only superseded by a new version or amendment with a forward reference.

## Source and identity
- Review packet (exact version):
- Source Git `brand.json` blob SHA at review:
- Related product ID, service SKU/price and URL:
- Previously approved identity version, if any:
- Reviewer: [explicit founder identity only when confirmed]
- Date/time and timezone of actual decision:
- Source of approval: [link/ref or precise conversation reference]
- Exact words of founder decision (verbatim):
- Reviewer response interpreted as: APPROVE DIRECTION / REVISE / REJECT / HOLD
- Ambiguity check: Did the founder specifically decide on this identity, rather than say “push” generally?

## Per-dimension score and rationale
| Element | Decision (accept/revise/reject/not assessed) | Exact feedback | Required change |
|---|---|---|---|
| Product name | | | |
| Customer purpose | | | |
| Origin story | | | |
| Voice & language | | | |
| Motto | | | |
| Color system | | | |
| Emblem/logo | | | |
| Website hero | | | |
| Buyer journey / CTA | | | |
| Evercraft OS relationship | | | |
| Distinctiveness versus other products | | | |
| Scope/product claims | | | |

## Outcome and work receipt
- Current identity approval state (distinct from checkout readiness):
- What exactly is approved? What remains conditional?
- Brand prototype version accepted:
- Files/assets changed (list commit SHAs or diff):
- Open questions/risks (including trademark clearance):
- Independent desktop/mobile QA: source, device/viewport, results, blockers; do not mark pass without evidence.
- Contrast/accessibility QA: exact measurement, method and source.
- Exact unchanged Stripe product/price/URL cross-check:
- Customer-facing publication QA result, public URL, retrieved timestamp and evidence:
- Social/other channel publication: provider ID and live permalink if any; otherwise **NOT PUBLISHED**.
- Commercial conversions: actual qualified inquiries, real paid receipts, reconciliations, deliveries, acceptance, refunds (all unknown/zero unless evidenced).
- Next version, follow-up owner, and next checkpoint:
- Approval for **specific identity** does not automatically approve legal name usage, account permissions, ad spend, new SKUs or cross-product approvals.

## Append-only event
Add a new record to `events.json`, update `ledger.json` and this product's `brand.json` / `product.json` / `products.json` in one traceable change. Link the resulting Git SHA and product issue. Preserve declined concepts and negative testing outcomes. Do not silently replace earlier decisions.
