# Fresh Saban commerce observations

## Separate runner

Re-ran Saban Visual Checkout Canary job 116314333613 through the connected GitHub interface. Fresh job 116563312157 ran at 2026-10-15 17:16–17:17 UTC and captured 14 videos and 14 screenshots. This used a separate GitHub-hosted runner, not the founder's HP or Chromebook.

Fresh artifact: https://github.com/jgaethle10/forge-operator/actions/runs/38702636272/artifacts/11992829809

Artifact SHA-256: 29bc6fff798975a3fd5499140b7bd54506c16a2e6a4bf74809ae5f39e7d1156e

12/14 pages returned HTTP 200. Site-Survive returned 404 in both viewports. Website Audit, IBM i Rescue, Legacy Rescue and FindMyPart each showed checkout CTA without the customer email field in both viewports.

The job's old success exit only established capture availability. This branch changes the canary to fail for broken routes, missing buyer email fields, incomplete captures and browser errors while retaining always-upload diagnostics.

## Complementary live probes

The checkout release canary reported unbound source release and deployment receipts, four incomplete offer contracts, and Site-Survive 404. Negative-confirmation-only POST requests returned 409 on four checkout endpoints and 404 on Site-Survive. These requests did not request a checkout or submit payment.

## Saban contract execution

Ran proof:saban-fulfillment locally using the repository's actual multiplier. 119 logical assignments, 15 workers, 17 definitions, all completed. The adapter checks declared contracts; this is not live dispatch into customer systems. Fixture payment-to-delivery and 17-product dry-run tests passed. No real provider payment, settlement, customer delivery, or production update was verified.

## Outstanding

Deploy and independently verify the current owned runtime so live email fields and Site-Survive match source. Obtain actual provider-backed payment-to-delivery evidence in an appropriate test environment. Source code and fixture success do not establish that the live deployment contains these fixes.
