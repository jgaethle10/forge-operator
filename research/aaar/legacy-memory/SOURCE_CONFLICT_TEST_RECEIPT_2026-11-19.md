# AAAR / FindMyPart source-claim conflict test receipt

**Evidence cut:** 2026-11-19 Pacific. **Execution:** offline local Node.js v22.16.0 on independent test compute. **No vendor systems contacted by the test.**

## Exact source identity
Local copies of the three canonical files were reconstructed and their Git blob hashes match the GitHub connector reads of draft PR #2309:

| File | Git blob SHA |
|---|---|
| `source-conflict-review.mjs` | `28c894240566f3b76a059d24605fa1735bebe7c7` |
| `source-conflict-review.test.mjs` | `6484fc11173de58086fec55510fc7c1cd175d070` |
| `document-claims-2026-11-19.json` | `0f4efe0c35207912b2e6d7a622457dd082f6ec79` |

## Commands and result
```bash
node --check source-conflict-review.mjs
node --check source-conflict-review.test.mjs
node --test source-conflict-review.test.mjs
node source-conflict-review.mjs document-claims-2026-11-19.json > result.json
sha256sum result.json
```

**Node test runner: 5 passed / 0 failed.** Cases:
1. Vendor warranty discrepancy detected (public catalog says three years; vendor PDF says five).
2. Different version / product scopes are not automatically treated as an identical product.
3. Unsupported `file://` evidence URL rejected and hold asserted.
4. Unknown input schema rejected.
5. Even a clean comparison does not authorize customer quotes or government submissions.

Sample actual result: `disposition=HOLD_CLARIFICATION`, `valid_claim_count=2`, `conflicts.length=1`, `automatic_supplier_qualification=false`, `automatic_customer_quote_authorized=false`, `government_response_authorized=false`.

**Result JSON SHA-256:** `29c997d4c341950b80fb44f6b8312358d7c3f930bb53d00682fde367fd4a130c`

## Primary public evidence reviewed
- [California PC FLASH catalog](https://www.californiapc.com/Industrial-Flash-Memory/Industrial-Grade-PCMCIA-Tough-Metal-Series-2/): series marketed with a **3-year warranty**, with PIO4 256MB `FPCI-256MB-2162TM2` listed and separate UDMA 256MB `FPCI-256MB-4162TM2` marked EOL.
- [California Peripherals & Components technical PDF, Tough Metal Series 2 Specs 1.0](https://californiapc.com/core/media/media.nl?c=3379633&h=2514f768f155d536786e&id=1047935): two pages independently examined, PDF specifies a **5-year warranty** (first-page list and second-page reliability table) with 256MB family and option variants.
- These are **conflicting documents from the supplier's own site**; the actual current written warranty for a specific purchasable SKU and whether a particular variant is available must be confirmed directly.

## Limits
A document conflict detector does not fetch sites automatically, authenticate documents, resolve which warranty is contractually binding, prove compatibility, claim available stock, qualify a supply chain, authorize a quote, contact anyone, or make an F-22 procurement response. The original Air Force SAM.gov PDF attachment remains unverified directly here; this PDF verification covers the **supplier datasheet only**, not the government PDF. No GitHub CI, deployed Node service, Systemia dispatch, or paying customer is asserted by this receipt.

**Related:** [AAAR draft PR #2309](https://github.com/jgaethle10/forge-operator/pull/2309), [supplier research #2301](https://github.com/jgaethle10/forge-operator/issues/2301).
