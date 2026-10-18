# Evercraft Influence Lab | evidence-first creative distribution

This is a **source-only candidate**, tracked by [Systemia intake issue #1389](https://github.com/jgaethle10/forge-operator/issues/1389). It has **no runtime connector, no production deployment, no Systemia admission receipt, no AI Boardroom quorum, no authorized social publisher, and no verified payments**.

## Design contract

`compileInfluenceBrief` produces three distinct creative treatments: designer/cultural craft, human firsthand evidence and direct product proof. Graphics Command should turn approved treatments into visuals. Musical timing should reinforce and never compete with the edit. Any simulated product imagery must be visibly labeled. Product pages, promises and price must follow live commerce evidence, not creative copy.

`reviewCreatorCandidate` holds incomplete opt-in consent, licensing, firsthand product claims and material-relationship disclosures. A positive review only means ready for **human review**, not permission to message a creator, offer compensation, publish a post or access their personal data. Do not collect sensitive traits, fabricate popularity, target children or exploit parasocial attachment.

`summarizeInfluenceObservations` deduplicates observations by event ID and makes funnel coverage `unknown` where no measurements are supplied. Even `provider_reported` settlement events are not independently authenticated in this module: the output deliberately **never reports settled, incremental or net revenue**. A future adapter must validate signed provider receipts, match/refund accounting and simple counterfactual baseline before promoting financial totals.

`preflightInfluenceDistribution` blocks creative launch unless fresh public offer, checkout and fulfillment canary evidence exists. Even a positive preflight requires separate Passport, Systemia, and Evercraft Clip authorization with provider publication IDs. No unreviewed posts, creator outreach, bulk email, charges, or external actions originate here.

## Intended handoffs

1. Systemia Intake Fabric admission/dedup and Passport authorization.
2. Boardroom deliberation with actual independent advisor receipts; blocked by issue #1339 until service execution is proven.
3. Existing Graphics Command / Creative Council, then renderer/rights/visual QA.
4. Evercraft Clip first-party media intake and authorized publisher; not wired yet.
5. Source-tagged first-party analytics plus payment and Shipping receipt reconciliation; not wired yet.

## Graphics Command integration and storyboard previews

`planInfluenceGraphics({brief,referenceCampaign})` compiles designer/human/proof treatments into three distinct native Graphics Command campaign and council plans without modifying the protected production renderer. This enables code-level review of creative direction and source lineage. The existing commercial SVG renderer is specifically a conversion-leak treatment; it is **not** compatible with presenting these three directions as differentiated finished assets.

`renderInfluenceConceptCollection(slate)` creates twelve distinctly laid-out, watermark-labeled **concept-only** SVG previews (three treatments times four formats). All are illustration, not evidence of a customer, deployment, audited website, product interface, partner collaboration or paid result.

To generate a **local, unpublished** reviewer gallery:

```bash
node systemia/influence-lab/render-concepts.mjs \
  --brief /path/to/influence-lab-brief.json \
  --reference systemia/graphics-command/campaigns/website-audit-attention.json \
  --out /path/to/new-preview-directory
```

The output must not be a pre-existing directory. It contains twelve SVGs, `index.html`, and `manifest.json`, with media/payment verification fields false and publication authority false. Do not attach actual customer screenshots until lawful usage rights and factual source receipts are recorded. Do not distribute concept previews as finished production artwork.

## Test

`node --test systemia/influence-lab/*.test.mjs systemia/graphics-command/commercial-renderer.test.mjs`

Tests are local schema/policy checks only. They are not independent provider, deployment or payment tests.
