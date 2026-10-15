# Native offer return correction

Live unpaid checkout tests against release ea03197 found the five original native offers and two added FindMyPart tiers prepared correctly. Eight added offers returned `Return origin is not authorized for this offer`. Quote readiness and Saban's 34 clean page recordings did not expose this runtime restriction.

Keep the owned offer and branded handoff pages; use the central buyer service's existing approved return origin and payment verification handler for all ten added products. Preserve existing Raven return paths. No allowlist broadening or payment bypass. Tests assert the approved origin and verification path. Seven affected routing tests passed. Paid settlement and fulfillment remain unverified. Successful preparations in this session are unpaid QA orders using checkout-qa@example.com.
