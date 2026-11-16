# DayTrade Lens: customer product cockpit v0.1

**Status: committed source, not independently confirmed as deployed or commercially available.**

This is the customer-facing Evercraft product **DayTrade Lens**, distinct from the founder's experimental Saban/Systemia market research and broker-adapter engineering. Preserve the existing public product registry and $19/month *planned Founding Beta*, but **do not charge anyone** until Evercraft Payments verifies production origin, paid receipt, entitlement and fulfillment.

## First customer experience

Owned source: public/daytrade-lens/index.html

- Overview explains what DayTrade Lens is and explicitly labels the local-only preview.
- Practice desk allows a user to enter a symbol, setup, virtual notional, hypothetical entry, stop, target and thesis.
- Risk model enforces $20 maximum virtual notional, $0.10 maximum modeled stressed downside (including 10 basis points adverse slippage and 5 basis points cost reserve) and 1.5:1 minimum modeled reward/risk.
- Local session discipline: at most two plans per local calendar day, no additional plan while one is unreviewed, and hold after self-reported losses reach $0.20.
- Journal records whether the idea was skipped or the user manually reports a *hypothetical* outcome, with optional reflection. Exports JSON with an unambiguous LOCAL_SELF_REPORTED_NO_BROKER provenance tag.
- A Saban / Scout / Independent Risk / Raven team architecture page shows each role as NOT CONNECTED rather than fabricating active agents.
- Evidence page links to preflight, order-gate and one-shot-transport PRs; all are clearly described as draft source changes rather than broker certification.
- Mobile and desktop styles, accessible labels, keyboard navigation, no remote scripts or runtime network calls, no live market API or broker credentials, no checkout or paid access.

## Security and product integrity

This is **not** brokerage software, not an automated trade executor, not personalized investment advice and not proof of returns. The illustrated trend is explicitly fictional. Data stays in browser localStorage until voluntarily exported or cleared, subject to device/browser storage availability. LocalStorage is not a secure vault; do not request broker API keys, balances or personally identifying information.

User-entered text is rendered using textContent, never as HTML. No entry is labeled a broker fill. Modelled stop prices are risk estimates, not protective orders or guarantees. This product should not display ticker prices, live agent status or account balances unless authoritative, appropriately scoped integrations supply fresh evidence and explicit user permissions.

## Separate roadmap: no hidden autonomy

1. **Source preview (this PR):** manual risk planning and private journaling. All order, account, market-data and AI agent runtime paths are disconnected.
2. **Read-only verified practice:** paid-free boundary preserved, attach authenticated market observations and broker paper read-only receipts only after consent, identity isolation and deployment receipts. Do not conflate historical replay with forward market observations.
3. **Agent observability:** Saban hypotheses, independent Risk veto and Raven reconciliation as receipt-backed views. No synthetic "agent working" activity.
4. **Paper-order pilot:** separate signed owner permits, dedicated PAPER credentials, broker state, durable idempotency, kill switch, manual emergency recovery and tested risk constraints. This must remain separately certified; the customer UI must not import or execute draft paper-order code.
5. **Commercial launch:** verify owned public HTTPS origin, product identity, accessible customer runtime, privacy and consumer disclosures, Evercraft Payments checkout, provider-paid verification, entitlement, refund/support paths and fulfillment. Do not claim $19/month activation until gates pass.
6. **Live-money authorization:** excluded from this product preview. Requires separate regulatory and safety review, customer brokerage agreements and explicit owner authorization; never assumed from paper performance.

## Verification

Run tests with:
node --test tests/daytrade-lens-product-cockpit.test.mjs

Verify JavaScript syntax with:
node --check public/daytrade-lens/app.mjs
node --check public/daytrade-lens/model.mjs

The GitHub workflow tests these contracts on pull requests. These checks validate source behavior and static constraints, not deployment, browser usability across devices, live market operation, model performance or commercial readiness.
