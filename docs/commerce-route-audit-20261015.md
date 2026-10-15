# Commerce route audit, 2026-10-15

Observed at 17:13:30 UTC using GET-only probes from this session.

- 13/13 exact approved transitional buyer pages passed selected-offer, price, intake and CTA checks.
- Incomplete payment return correctly returned HTTP 400 without a second payment form.
- Expanded route canary: 66/67 URLs passed (buyer home, capability directory, 13 offers and 52 source-catalog capability pages).
- 51/52 capability pages passed. `/capabilities/lineage-founding-pilot-v1` returned HTTP 404 and non-HTML content.
- Website Audit initially returned HTTP 404 at approximately 17:10 UTC, then passed the expanded sweep. This is a time-separated observation, not proof that this branch repaired production.
- No checkout POST, payment, provider-paid receipt, settlement or fulfillment was performed in this session.

Source repair in this branch: payment-manifest exclusions override older Fabric discovery sell-now metadata for AliEV/RIVET, ROASTED and paid Clip production. Free discovery remains available. All 17 Fabric tests pass and the legacy URL policy check passes.

Deployment remains outstanding. Source publication is not runtime deployment. The current synthetic checkout and payment receipt evidence in the existing payment manifest must not be upgraded based on these GET-only probes. The additional capability page must be repaired in the owned runtime/route deployment and independently rechecked.
