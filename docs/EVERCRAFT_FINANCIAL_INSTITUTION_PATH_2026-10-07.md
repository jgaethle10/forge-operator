# Evercraft Financial Institution Path

Date: 2026-10-07
Status: architecture and charter-feasibility lane, not a bank or credit union launch

## Decision

Evercraft Payments remains the canonical economic-order and payment layer. A new Evercraft Financial layer may coordinate financial experiences and regulated partners, but it must fail closed on depository or lending powers Evercraft does not yet possess.

No Evercraft surface should describe itself as a bank, credit union, FDIC-insured institution, NCUA-insured institution, deposit taker, or principal lender unless the corresponding authority is documented and verified.

## Build sequence

### Stage 0: Evercraft Payments
Own canonical economic orders, receipts, entitlements, settlement routing, refunds/reversals, economic lineage, and agent-commerce authority. Stripe remains a replaceable settlement adapter behind Raven Nexus.

### Stage 1: Evercraft Financial
Add financial intelligence, account aggregation where permissioned, cash-flow views, business economics, savings goals, financing discovery, partner-routed financial products, and regulated-provider handoffs. Evercraft owns the experience and orchestration. Regulated institutions own regulated activity.

### Stage 2: Charter feasibility
Maintain two separate research tracks:

1. Member-owned cooperative route: federal or Washington-chartered credit union.
2. Investor/holding-company route: state or national bank, with deposit-insurance application where applicable.

Do not collapse these into one governance model. A credit union is member-owned and requires an eligible field of membership. A bank can preserve an investor-owned structure but carries a materially different charter, capital, management, compliance, and supervisory burden.

### Stage 3: Chartered depository
Only after charter authority and required deposit/share insurance authority are verified should Evercraft enable regulated depository claims or direct depository execution.

## Current official reference points

- NCUA states that a new federal credit union requires an approved field of membership before the full charter application and that federal credit unions are member-owned cooperatives:
  https://ncua.gov/support-services/credit-union-resources-expansion/starting-new-federal-credit-union
- NCUA's March 30, 2026 Charter Application Guide says organizers should generally expect at least one year for the process and gives informal capital-planning guidance starting around $500,000 depending on the proposed institution:
  https://publishedguides.ncua.gov/charteringmanual/Content/Resources/PDFs/2026-03-30%20Charter%20Application%20Guide.pdf
- Washington DFI supervises Washington-chartered credit unions:
  https://dfi.wa.gov/credit-unions
- FDIC's de novo guidance describes deposit-insurance applications for new institutions and emphasizes sound business plans, experienced leadership, and appropriate capital support:
  https://www.fdic.gov/bank-examinations/applications-deposit-insurance
- OCC de novo chartering information should be treated as a separate national-bank path rather than evidence of state charter authority:
  https://www.occ.treas.gov/topics/charters-and-licensing/de-novo-chartering/index-de-novo-chartering.html

## Systemia admission gates

Before a charter mission advances, Systemia should require:
- exact proposed legal entity and ownership model
- proposed charter type
- proposed field of membership if credit union
- regulator-of-record
- deposit/share insurance path
- board and executive management requirements
- capital plan
- three-year and five-year pro formas
- BSA/AML, sanctions, privacy, cybersecurity, vendor, complaint, fair-lending, and consumer-compliance programs as applicable
- independent legal and regulatory review
- evidence-backed go/no-go decision

## Immediate implementation target

Build the platform so Evercraft can support the economic relationship before chartering:
Systemia University proves capability -> Evercraft execution network creates work -> Evercraft Payments settles authorized commerce -> Evercraft Financial organizes financial intelligence and regulated partner access -> a future chartered institution may become one regulated execution rail.

That preserves optionality while preventing premature banking claims.
