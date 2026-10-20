# Aiden's Undervalued Asset Radar | Review-stage core

**Status:** read-only prototype. This code is not connected to a live marketplace feed, a running Systemia heartbeat, a production datastore or an automatic purchase mechanism. A separately scheduled ChatGPT research alert is not proof of owned-Fabric execution.

## Goal

Hunt for deeply undervalued legitimate physical assets, starting with collectible trading cards, sports cards, comics, retro games, toys and memorabilia, then watches, cameras, equipment and other resalable goods. Global discovery may include legal US-shippable objects, with Yakima-area pickup prioritized where useful.

The module owns **pure evidence-backed evaluation** and human review selection only. After approved source connectors and independent runtime receipts, integrate as an admitted Systemia Radar lane, rather than creating a rival authority or touching CHUM Money Radar, which tracks Evercraft's buyer funnel.

## Decision chain

`Permissioned listing observation → exact identity and grade → verified completed-sale comps → conservative realized value → all-in acquisition cost → conservative resale costs and risk buffer → live seller/authenticity gate → deduplication → human review`

Initial criteria:
- Exact item variant/edition and condition or grade match; at least **two distinct, completed verified sales within 180 days**, never active asking prices.
- A separate trusted completed-sales adapter must explicitly authorize the exact `source_id:sale_id` identities using the evaluator's `trusted_completed_sale_ids` option. Self-asserted JSON `completed_sold_verified` labels do not count as verified transactions. Public JSON CLI imports intentionally provide **no** such authority.
- Fresh verified-active listing (checked within two hours), direct HTTPS listing URL, seller reviewed, credible authenticity/provenance.
- Acquisition includes listing price, shipping and tax. Resale defaults are **13% selling fee, $15 shipping, 10% risk reserve**, plus supplied grading, restoration and other expenses. These are screening assumptions, not specific marketplace quotes.
- Conservative benchmark is the **lowest** valid completed-sale comparable, not a guidebook price or appraisal. Require acquisition ≤50% of the benchmark and estimated net upside ≥$100.
- Missing costs, source status, exact grades, seller review, provenance or comps fail closed to `WATCH_UNVERIFIED`. Stolen, counterfeit or restricted goods are `REJECTED`.
- A scored success is `QUALIFIED_FOR_HUMAN_REVIEW`, never authority to purchase, bid or contact a seller. Alert duplicate keys incorporate source, listing ID and all-in price inputs so a price drop can appear as a fresh candidate.

## eBay Browse normalization, staged but not live

`ebay-browse-adapter.mjs` now normalizes supplied **eBay Browse getItem** JSON
into the same fail-closed assessment contract. It accepts an upstream trusted
request receipt reference, permission reference, an explicitly quoted US shipping
cost, tax verification and human-supplied exact variant/grade and resale costs.

**Important:** these are caller-supplied assertions, not independently validated
credentials or digitally signed API receipts. Production transport must confirm
OAuth authority, HTTPS response origin, actual request ID, response status and
provider item ID before passing `source_access`. The adapter neither fetches
listings nor establishes that any credentials or market entitlements exist.

- Live-item candidates preserve provider price, item URL, estimated in-stock
  availability and specific US destination shipping when evidenced.
- Missing tax quotes, delivery estimates, proof, fixed-price status, and
  item end dates remain unverified. They are not silently assumed to be zero.
- Seller feedback is contextual only, **never** proof of authenticity.
- Browse getItem provides no completed-sale transaction evidence; the adapter
  emits **zero sold comps** and deliberately cannot qualify a bargain alone.
- Auctions remain unverified in v1 because a changing bid is not a final buy price.
- Fee and evidence-screening policy overrides can only **tighten**, never relax,
  the default thresholds.

```bash
node --test systemia/asset-radar/engine.test.mjs systemia/asset-radar/ebay-browse-adapter.test.mjs
```

## Source adapters not yet connected

Evaluate permitted official marketplace interfaces and legitimately sourced transaction exports; eBay Browse/listing APIs, sale-history services with appropriate access, card transaction sources, approved auction feeds and legally accessible local/estate listings are potential starting points. Respect each source's terms, permissions, rate limits, and privacy restrictions. Do not scrape accounts or evade access restrictions. An active ask, price-guide estimate or similarly named card is **not** a transaction comp. Avoid unverified AI estimates of grading and condition.

Source records must preserve listing status plus checked timestamp, origin URL/ID, actual sold transaction URLs and IDs, item variant and condition, seller review, fee assumptions and authenticity assessment, and the source's permission provenance. USD only in version one; other currencies require independently timestamped exchange-rate evidence before comparison.

## Test and local offline trial

```bash
node --test systemia/asset-radar/engine.test.mjs
node systemia/asset-radar/cli.mjs path/to/permissioned-observations.json
```

The CLI reads JSON with a `listings` array, optional `as_of` ISO timestamp, and optional `previously_alerted_keys` array. It emits assessments/review alerts on stdout, never polls marketplaces, installs timers, persists data, communicates with a seller or purchases anything. Current tests use fictional examples rather than real active listings.

## Optional authorized eBay Browse source smoke (not a deployed heartbeat)

The owned collector in `ebay-browse-collector.mjs` can search up to two
queries and refresh up to four official item details per one-shot run. It
requires a properly licensed eBay application, an approved permission reference,
application credentials in environment variables, and a destination ZIP. If
authorization or credentials are absent, it fails **before making any network
request**. It uses eBay application OAuth and read-only Browse GET endpoints.

For an operator with independently verified rights, credentials securely
injected at runtime and an approved source-access record:

Configure `EBAY_BROWSE_ACCESS_APPROVED=yes`, `EBAY_BROWSE_PERMISSION_REF`,
`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` and `EBAY_DESTINATION_ZIP`
using a trusted secrets-injection mechanism, not by pasting values into a
recorded shell command. Example after those variables are securely injected:

```bash
node systemia/asset-radar/ebay-smoke-cli.mjs 'graded pokemon holo' 'vintage nintendo game'
```

Do **not** paste live credentials into chat, shell history, issues, CI YAML,
public storage or Git. Source-access approval must reflect actual eBay licensing,
not merely a set flag. Consult eBay's Browse API terms and call limits.

This command returns **LISTING_DISCOVERY_ONLY**, not deals. It records public
listing evidence and conservative WATCH_UNVERIFIED assessments, without verified
sold comps or authenticity. The SHA response reference is a local artifact
fingerprint, **not** provider-signed proof or independent authorization.

A real completed-sale API or permissioned verified transaction export is a
**separate gate**; active listing asks must never be turned into sold prices.

```bash
node --test systemia/asset-radar/*.test.mjs
```

## Systemia admission gates before production

1. Permissioned live-source integrations, verified completed-sale evidence, terms/rate-limit audits and provenance receipts.
2. Canonical Systemia observation admission, structured evidence receipts, authorized ledger dedup and durable source-health monitoring; preserve `UNKNOWN` and `INFERRED` truth states.
3. Human adult purchase approval: Aiden may scout and rank; **any transaction, bid, seller message, fund movement, shipping coordination or contract requires explicit founder/adult approval and relevant outbound contact gates**.
4. Provider-freshness and anti-fraud canaries: reprints, raw-versus-graded condition, shipping inflation, auction ending, seller spoofing, duplicate comps, forged transaction claims, inappropriate categories and return risk.
5. Separate deployment receipts proving the owned compute/heartbeat and user-facing candidate links actually work. The ChatGPT hourly alert is independent and does not mean this code is deployed.

No profit guarantee. Keep discovery and purchase budgets separate and protect business-critical liquidity.
